import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const marketplacePath = path.resolve(process.cwd(), 'src/components/Marketplace.tsx')
const compactWidgetPath = path.resolve(process.cwd(), 'src/components/dashboard/MarketOffersCompactWidget.tsx')

test('market monitoring views default to all regions', () => {
  const marketplaceSource = fs.readFileSync(marketplacePath, 'utf8')
  const compactWidgetSource = fs.readFileSync(compactWidgetPath, 'utf8')

  assert.match(marketplaceSource, /const DEFAULT_REGION = 'all'/)
  assert.match(compactWidgetSource, /const DEFAULT_REGION = 'all'/)
  assert.doesNotMatch(marketplaceSource, /const DEFAULT_REGION = 'pomorskie'/)
  assert.doesNotMatch(compactWidgetSource, /const DEFAULT_REGION = 'pomorskie'/)
})