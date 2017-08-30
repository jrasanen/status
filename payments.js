const each = require('ramda').forEachObjIndexed
const map = require('ramda').mapObjIndexed
const parse = require('xml2js').parseString;
const request = require('superagent');
const crypto = require('crypto');

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



const open = () => {
  const orderData = {
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

  var params = Object.assign({}, defaults, orderData);
  const values = mac_fields.map((e) => params[e])
  const hash_string = values.join('+')
    
  params['MAC'] = crypto.createHash('md5').update(hash_string).digest("hex").toUpperCase()
  
  request.post('https://payment.checkout.fi')
    .type('form')
    .send(params)
    .then((r) => {
      return new Promise((ok, nooo) =>
        parse(r.text, (err, res) =>
          err != null ? nooo(err) : ok(res.trade.payments.pop().payment.pop().banks.pop())))
    })
    .then((buttons) => {
      each((element, bankName) => {
        const data = element.pop()
        const url = data.$.url
        delete data.$

        const payload = map((data, key) => data.pop(), data)

        const start = (new Date()).getTime()

        new Promise((ok, no) => {
          request.post(url)
            .type('form')
            .timeout({
              response: 1000,
              deadline: 1500,
            })
            .send(payload)
            .then((response) => ok(response.statusCode))
            .catch((err) => {
              if (err.code === 'ECONNABORTED') {
                ok(408)
              } else {
                no(err)
              }
            })
        })
        .then((code) => {
          const end = (new Date()).getTime()
          const t = (end - start) / 1000;
          console.log(`${code} > ${bankName} (${t} s)`)
        })
      }, buttons)
    })
}

module.exports = { open: open }