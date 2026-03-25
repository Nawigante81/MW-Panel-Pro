import test from 'node:test'
import assert from 'node:assert/strict'
import { computeHashSignature, likelyDuplicateByHeuristic, normalizeExternalListing, parseListingsFromHtml } from '../../server/externalListings.js'

test('normalizeExternalListing maps essential fields', () => {
  const out = normalizeExternalListing({
    id: 'abc',
    url: 'https://example.com/offer/abc',
    title: '  Mieszkanie  ',
    city: 'Warszawa',
    price: '800000',
    area: '52.5',
    rooms: 2,
    images: ['a.jpg'],
  }, { id: 'src', code: 'otodom' })

  assert.equal(out.sourceId, 'src')
  assert.equal(out.sourceListingId, 'abc')
  assert.equal(out.sourceUrl, 'https://example.com/offer/abc')
  assert.equal(out.title, 'Mieszkanie')
  assert.equal(out.price, 800000)
  assert.equal(out.areaM2, 52.5)
  assert.equal(out.imagesJson.length, 1)
  assert.ok(out.hashSignature)
})

test('hash signature changes when core content changes', () => {
  const a = computeHashSignature({ title: 'A', city: 'W', price: 100, areaM2: 40 })
  const b = computeHashSignature({ title: 'A', city: 'W', price: 200, areaM2: 40 })
  assert.notEqual(a, b)
})

test('heuristic duplicate detection catches close records', () => {
  const a = { title: 'Działka budowlana Krzyki', city: 'Wrocław', district: 'Krzyki', price: 400000, areaM2: 0 }
  const b = { title: 'Działka budowlana Wrocław Krzyki', city: 'Wrocław', district: 'Krzyki', price: 410000, areaM2: 0 }
  assert.equal(likelyDuplicateByHeuristic(a, b), true)
})

test('parseListingsFromHtml parses JSON-LD offers without crashing', () => {
  const html = `
  <html><head>
  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "itemListElement": [
        {
          "item": {
            "@id": "https://www.otodom.pl/pl/oferta/mieszkanie-test-ID6abc123",
            "url": "https://www.otodom.pl/pl/oferta/mieszkanie-test-ID6abc123",
            "name": "Mieszkanie 2 pokoje Gdynia",
            "description": "Opis oferty testowej",
            "offers": { "price": 650000 },
            "address": { "addressLocality": "Gdynia" },
            "image": ["https://example.com/1.jpg"]
          }
        }
      ]
    }
  </script>
  </head><body></body></html>`

  const parsed = parseListingsFromHtml(html, { code: 'otodom', base_url: 'https://www.otodom.pl' })
  assert.ok(Array.isArray(parsed))
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].title, 'Mieszkanie 2 pokoje Gdynia')
  assert.equal(parsed[0].price, 650000)
  assert.equal(parsed[0].sourceUrl, 'https://www.otodom.pl/pl/oferta/mieszkanie-test-ID6abc123')
})
