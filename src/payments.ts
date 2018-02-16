import * as crypto from 'crypto';
import { forEachObjIndexed as each, mapObjIndexed as map, merge } from 'ramda';
import * as request from 'superagent';
import { parseString as parse } from 'xml2js';

// tslint:disable-next-line:readonly-keyword
interface Assoc { [key: string]: string; }
interface BenchmarkResult { readonly code: number|string|undefined; readonly provider: string; readonly time: number; }
type BenchmarkResponse = Promise<void | BenchmarkResult[]>;

const PSP_URL: string = 'https://payment.checkout.fi';
const ALGO: string = 'md5';
const TIMEOUT: { readonly response: number, readonly deadline: number } = {
  response: 1800,
  deadline: 3500
};

// Fields used required in mac calculation
const macFields: string[] = [
  'VERSION',
  'STAMP',
  'AMOUNT',
  'REFERENCE',
  'MESSAGE',
  'LANGUAGE',
  'MERCHANT',
  'RETURN',
  'CANCEL',
  'REJECT',
  'DELAYED',
  'COUNTRY',
  'CURRENCY',
  'DEVICE',
  'CONTENT',
  'TYPE',
  'ALGORITHM',
  'DELIVERY_DATE',
  'FIRSTNAME',
  'FAMILYNAME',
  'ADDRESS',
  'POSTCODE',
  'POSTOFFICE',
  'SECURITY_KEY'
];

// Default values if none provided
const defaults: { readonly [key: string]: string|number } = {
  VERSION: '0001',
  STAMP: '',
  AMOUNT: '',
  REFERENCE: '',
  MESSAGE: '',
  LANGUAGE: 'FI',
  RETURN: '',
  CANCEL: '',
  REJECT: '',
  DELAYED: '',
  COUNTRY: 'FIN',
  CURRENCY: 'EUR',
  DEVICE: '10',
  CONTENT: '1',
  TYPE: '0',
  ALGORITHM: '3',
  DELIVERY_DATE: '',
  FIRSTNAME: '',
  FAMILYNAME: '',
  ADDRESS: '',
  POSTCODE: '',
  POSTOFFICE: '',
  MAC: '',
  EMAIL: '',
  PHONE: '',
  MERCHANT: '375917',
  SECURITY_KEY: 'SAIPPUAKAUPPIAS'
};

// Get demo parameters
const buildDemoParams: () => Assoc = () => {
  return {
    STAMP: (new Date()).getTime().toString(),
    REFERENCE: '0',
    MESSAGE: 'Food',
    RETURN: 'http://example.com/return',
    CANCEL: 'http://example.com/return',
    AMOUNT: '1234',
    DELIVERY_DATE: '20170518',
    FIRSTNAME: 'Meh',
    LASTNAME: 'Blem',
    ADDRESS: 'Fakestreet 1234',
    POSTCODE: '33720',
    POSTOFFICE: 'Tampere',
    EMAIL: 'support@checkout.fi',
    PHONE: '0800 552 010'
  };
};

/*
 * MD5 digest string from an array of values
 * @param {array} array of values to calculate the md5 hash from.
 * @returns {string} Uppercase MD5 hash
 */
const digest: (a: string[]) => string =
  (values) =>
    crypto.createHash(ALGO).update(values.join('+')).digest('hex').toUpperCase();

/*
 * Get payload's MAC string
 * @param {object} values Payload to get mac from
 * @param {array} fields Fields required for mac
 * @returns {string} md5 mac
 */
const mac: (v: Assoc, f: string[]) => string =
  (values, fields) =>
    digest(fields.map((e) => values[e]));

/*
 * Get parameters. Merges defaults with provided data.
 */
const params: (d: Assoc) => Assoc = (data) => merge(defaults, data);

/*
 * Get payload required for psp's payment wall
 * @param {object} input Post data
 * @returns {string} md5 mac
 */
const getPayload: (i: Assoc) => Assoc = (input) => {
  // tslint:disable-next-line:no-var-keyword
  const data: Assoc = params(input);
  data.MAC = mac(data, macFields);

  return data;
};

/*
 * Get Payment button wall
 * @param {object} Post data, uses test data if no data provided
 * @returns {Promise<XML>} Payment wall object
 */
const open: (d?: Assoc | undefined) => Promise<request.Response> = (data) =>
  request.post(PSP_URL).type('form').send(getPayload(data ? data : buildDemoParams()));


/*
 * Calculate difference between two timestamps
 * @param {number} start Start time to substract current time from
 * @returns {number} Time in seconds
 */
const timeDifference: (s: number) => number = (start) => ((new Date()).getTime() - start) / 1000;

export const benchmark: () => BenchmarkResponse =
() => {
  const start: number = (new Date()).getTime();
  const fetches: Array<Promise<BenchmarkResult>> = [];

  return open()
  .then((r) => {
    fetches.push(Promise.resolve({ code: 200, provider: 'psp', time: timeDifference(start) }));

    return new Promise((ok, no) =>
      parse(r.text, (err, res) => {
        if (err != null) {
          no(err);
        } else {
          ok(res.trade.payments.pop().payment.pop().banks.pop());
        }
      }));
  })
  .then((buttons) => {
    each((element, provider) => {
      const data: { readonly $: { readonly url: string } } = element.pop();

      const url: string | undefined = data.$.url;

      const payload: Assoc = map((d: Assoc) => d[0], data);
      const startButtons: number = (new Date()).getTime();
      fetches.push(
        new Promise((ok, no) => {
          request.post(url)
            .type('form')
            .timeout(TIMEOUT)
            .send(payload)
            .then((response) => ok(response.status))
            .catch((err) => {
              if (err.code === 'ECONNABORTED') {
                ok(408);
              } else {
                no(err);
              }
            });
        })
        .then((code: number) => {
          return {
            code: code,
            provider: provider,
            time: timeDifference(startButtons)
          };
        })
      );
    }, buttons);

    return Promise.all(fetches);
  })
  .catch(console.error);
};
