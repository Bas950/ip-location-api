# @iplookup/country [![npm version](https://img.shields.io/npm/v/@iplookup/country?color=success&style=flat-square&label=npm)](https://www.npmjs.com/package/@iplookup/country)


This is an API created to make [ip-location-api](https://github.com/sapics/ip-location-api) available for browsers.
The database itself is large at 7MB, so it is splitted into over 2000 pieces for fast downloading in a browser.


## Synopsis

```html
<script src="https://cdn.jsdelivr.net/npm/@iplookup/country/iplookup.min.js"></script>
<script type="text/javascript">
var ip = "207.97.227.239"
var location = await IpLookup(ip)
console.log(location) // {country: 'FR'}
</script>
```

#### ESM

```javascript
import IpLookup from '@iplookup/country'
await IpLookup("2402:b801:ea8b:23c0::")
```

#### CJS

```javascript
const IpLookup = require('@iplookup/country')
await IpLookup("207.97.227.239")
```

If you need extra information about country, try to use [@iplookup/country-extra](https://github.com/sapics/ip-location-api/tree/main/browser/country-extra).


## License

Since each user download a partial database, we use the CC0 Licensed database [geo-whois-asn-country](https://github.com/sapics/ip-location-db/tree/main/geo-whois-asn-country) for ip to country mapping to avoid license problem.

The software itself is published under MIT License by [sapics](https://github.com/sapics).