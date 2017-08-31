const each = require('ramda').forEachObjIndexed
const map = require('ramda').mapObjIndexed
const merge = require('ramda').merge
const parse = require('xml2js').parseString;
const request = require('superagent');
const crypto = require('crypto');

const PSP_URL = 'https://payment.checkout.fi'
const ALGO = 'md5'
const TIMEOUT = {
  response: 1800,
  deadline: 3500,
}

// Fields used required in mac calculation
const mac_fields = [
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
]

// Default values if none provided
const defaults = {
  'VERSION': '0001',
  'STAMP': '', 
  'AMOUNT': '',
  'REFERENCE': '',
  'MESSAGE': '',
  'LANGUAGE': 'FI',
  'RETURN': '',
  'CANCEL': '',
  'REJECT': '',
  'DELAYED': '',
  'COUNTRY': 'FIN',
  'CURRENCY': 'EUR',
  'DEVICE': '10',
  'CONTENT': '1',
  'TYPE': '0',
  'ALGORITHM': '3',
  'DELIVERY_DATE': '',
  'FIRSTNAME': '',
  'FAMILYNAME': '',
  'ADDRESS': '',
  'POSTCODE': '',
  'POSTOFFICE': '',
  'MAC': '',
  'EMAIL': '',
  'PHONE': '',
  'MERCHANT': '375917',
  'SECURITY_KEY': 'SAIPPUAKAUPPIAS'
}

// Get demo parameters
const buildDemoParams = () => {
  return {
    'STAMP': (new Date()).getTime(),
    'REFERENCE': '0',
    'MESSAGE': 'Food',
    'RETURN': 'http://example.com/return',
    'CANCEL': 'http://example.com/return',
    'AMOUNT': 1234,
    'DELIVERY_DATE': '20170518',
    'FIRSTNAME': 'Meh',
    'LASTNAME': 'Blem',
    'ADDRESS': 'Fakestreet 1234',
    'POSTCODE': 33720,
    'POSTOFFICE': 'Tampere',
    'EMAIL': 'support@checkout.fi',
    'PHONE': '0800 552 010'
  }
}

/*
 * MD5 digest string from an array of values
 * @param {array} array of values to calculate the md5 hash from.
 * @returns {string} Uppercase MD5 hash
 */ 
const digest = (values) =>
  crypto.createHash(ALGO).update(values.join('+')).digest('hex').toUpperCase() 

/*
 * Get payload's MAC string
 * @param {object} Payload
 * @returns {string} md5 mac
 */ 
const mac = (values, fields) => digest(fields.map((e) => values[e]))

const params = (data) => merge(defaults, data)

/*
 * Get payload required for psp's payment wall
 * @param {object} Post data
 * @returns {string} md5 mac
 */ 
const payload = (data) => {
  const data = params()
  return merge(data, { 'MAC': mac(data, mac_fields) })
}

/*
 * Get Payment button wall
 * @param {object} Post data, uses test data if no data provided 
 * @returns {Promise<XML>} Payment wall object
 */ 
const open = (data) =>
  request.post(PSP_URL).type('form').send(payload(data? data : buildDemoParams()))

const benchmark = () => {
  const start = (new Date()).getTime()
  const fetches = []
  open()
  .then((r) => {
    const end = (new Date()).getTime()
    const t = (end - start) / 1000;
    fetches.push(Promise.resolve({ code: 200, provider: 'psp', time: t }))
    return new Promise((ok, nooo) =>
      parse(r.text, (err, res) =>
        err != null ? nooo(err) : ok(res.trade.payments.pop().payment.pop().banks.pop())))
  })
  .then((buttons) => {
    each((element, provider) => {
      const data = element.pop()
      const url = data.$.url
      delete data.$

      const payload = map((data, key) => data.pop(), data)
      const start = (new Date()).getTime()
      fetches.push(
        new Promise((ok, no) => {
          request.post(url)
            .type('form')
            .timeout({
              response: 1800,
              deadline: 3500,
            })
            .send(payload)
            .then((response) => ok(response.statusCode))
            .catch((err) => 
              err.code === 'ECONNABORTED' ? ok(408) : no(err)
            )
        })
        .then((code) => {
          const end = (new Date()).getTime()
          const t = (end - start) / 1000;
          return {
            code: code,
            provider: provider,
            time: t
          }
        })
      )
    }, buttons)

    Promise.all(fetches).then(results => {
      console.log(results)
    })
  })
  .catch(console.error)
}

module.exports = { open: open, benchmark: benchmark }