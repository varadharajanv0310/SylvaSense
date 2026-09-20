/**
 * Mock forest-intelligence data.
 * Values are plausible for a ~1.2 Mha tropical monitoring cell; they are
 * invented for the prototypes and are not derived from real observations.
 * Swap this file for live API responses when the platform is wired up.
 */

export const SITE = {
  id: 'SVS-BR-RO-0417',
  name: 'Jaci-Paraná Corridor',
  region: 'Rondônia, Brazil',
  bbox: '-64.21, -9.86, -63.44, -9.12',
  areaHa: 1_184_600,
  biome: 'Moist broadleaf tropical',
  tile: 'T20LLQ',
  epsg: 'EPSG:32720',
}

export const METRICS = {
  treesDetected: 2_417_338,
  canopyCoverPct: 61.4,
  canopyCoverPct1990: 92.8,
  meanCanopyHeightM: 24.7,
  agbTHa: 218.6,
  carbonStockMtC: 118.4,
  carbonLostMtC: 41.9,
  annualSequestrationMtCO2: 3.86,
  lossHa2024: 38_412,
  lossHaCumulative: 372_940,
  degradationZones: 147,
  alertsLast30d: 412,
  meanConfidence: 0.938,
  revisitDays: 5,
}

export const SENSORS = [
  {
    key: 'S1',
    name: 'Sentinel-1',
    mode: 'C-band SAR',
    band: '5.405 GHz',
    res: '10 m',
    revisit: '6 days',
    reads: 'Structure through cloud and darkness',
    color: '#8fb3ff',
  },
  {
    key: 'S2',
    name: 'Sentinel-2',
    mode: 'Multispectral optical',
    band: '443–2190 nm · 13 bands',
    res: '10 m',
    revisit: '5 days',
    reads: 'Vegetation vigour, NDVI, species signature',
    color: '#7bd88f',
  },
  {
    key: 'L9',
    name: 'Landsat 8/9',
    mode: 'Optical + thermal',
    band: '435–12510 nm',
    res: '30 m',
    revisit: '16 days',
    reads: 'The 50-year baseline',
    color: '#ffd28f',
  },
  {
    key: 'LID',
    name: 'Airborne LiDAR',
    mode: 'Discrete-return point cloud',
    band: '1064 nm',
    res: '0.4 m',
    revisit: 'Campaign',
    reads: 'True canopy height and vertical structure',
    color: '#ff9bd2',
  },
]

/** Canopy cover %, 1985 → 2026. Hand-shaped to read as a real decline curve. */
export const CANOPY_SERIES: { year: number; cover: number; lossHa: number }[] = (() => {
  const out: { year: number; cover: number; lossHa: number }[] = []
  let cover = 96.2
  for (let y = 1985; y <= 2026; y++) {
    const era =
      y < 1992 ? 0.42 : y < 2000 ? 1.15 : y < 2006 ? 1.62 : y < 2013 ? 0.74 : y < 2019 ? 1.28 : y < 2023 ? 2.05 : 1.34
    const wobble = Math.sin(y * 1.7) * 0.16 + Math.sin(y * 0.53) * 0.1
    cover = Math.max(58, cover - era - wobble * 0.5)
    out.push({ year: y, cover: +cover.toFixed(2), lossHa: Math.round((era + wobble) * 14_800) })
  }
  return out
})()

/** Tree-ring widths in mm, 1802 → 2026, with drought and fire scar years. */
export const RING_SERIES: { year: number; width: number; scar: 0 | 1 | 2 }[] = (() => {
  const out: { year: number; width: number; scar: 0 | 1 | 2 }[] = []
  const fires = new Set([1847, 1889, 1926, 1963, 1998, 2010, 2016, 2024])
  const droughts = new Set([1877, 1912, 1941, 1983, 1997, 2005, 2010, 2015, 2023, 2024, 2025])
  for (let y = 1802; y <= 2026; y++) {
    const age = y - 1802
    let w = 3.6 * Math.exp(-age / 150) + 0.72
    w *= 1 + Math.sin(y * 0.9) * 0.14 + Math.sin(y * 0.31) * 0.09
    if (droughts.has(y)) w *= 0.44
    if (y > 1995) w *= 1 - Math.min(0.42, (y - 1995) * 0.013)
    out.push({ year: y, width: +Math.max(0.16, w).toFixed(3), scar: fires.has(y) ? 2 : droughts.has(y) ? 1 : 0 })
  }
  return out
})()

/** Specimen records for the herbarium concept. */
export const SPECIMENS = [
  { id: 'SVS.0001', taxon: 'Bertholletia excelsa', common: 'Brazil nut', coords: '9°41′S 64°02′W', last: '2019-08-14', status: 'Cleared' },
  { id: 'SVS.0142', taxon: 'Dipteryx odorata', common: 'Cumaru', coords: '9°28′S 63°55′W', last: '2021-03-02', status: 'Degraded' },
  { id: 'SVS.0318', taxon: 'Cedrela odorata', common: 'Spanish cedar', coords: '9°50′S 63°41′W', last: '2017-11-27', status: 'Cleared' },
  { id: 'SVS.0906', taxon: 'Hevea brasiliensis', common: 'Rubber tree', coords: '9°33′S 64°11′W', last: '2023-06-19', status: 'Degraded' },
  { id: 'SVS.1177', taxon: 'Swietenia macrophylla', common: 'Big-leaf mahogany', coords: '9°19′S 63°48′W', last: '2014-02-08', status: 'Cleared' },
  { id: 'SVS.1480', taxon: 'Manilkara huberi', common: 'Massaranduba', coords: '9°44′S 63°37′W', last: '2022-09-30', status: 'Under watch' },
  { id: 'SVS.1902', taxon: 'Ceiba pentandra', common: 'Kapok', coords: '9°12′S 64°06′W', last: '2020-12-11', status: 'Degraded' },
  { id: 'SVS.2244', taxon: 'Astrocaryum aculeatum', common: 'Tucumã', coords: '9°57′S 63°52′W', last: '2025-04-23', status: 'Under watch' },
  { id: 'SVS.2711', taxon: 'Carapa guianensis', common: 'Andiroba', coords: '9°36′S 63°29′W', last: '2018-07-05', status: 'Cleared' },
  { id: 'SVS.3050', taxon: 'Euterpe precatoria', common: 'Açaí-do-amazonas', coords: '9°25′S 64°18′W', last: '2024-01-16', status: 'Degraded' },
  { id: 'SVS.3388', taxon: 'Virola surinamensis', common: 'Ucuúba', coords: '9°48′S 64°09′W', last: '2016-05-29', status: 'Cleared' },
  { id: 'SVS.3764', taxon: 'Copaifera langsdorffii', common: 'Copaíba', coords: '9°30′S 63°44′W', last: '2025-10-02', status: 'Under watch' },
]

export const ALERTS = [
  { id: 'ALT-8841', type: 'Clear-cut', ha: 412.6, conf: 0.97, days: 2, coords: '9°38′S 63°51′W' },
  { id: 'ALT-8836', type: 'Selective logging', ha: 88.1, conf: 0.84, days: 4, coords: '9°44′S 64°03′W' },
  { id: 'ALT-8819', type: 'Burn scar', ha: 1_247.9, conf: 0.99, days: 6, coords: '9°21′S 63°39′W' },
  { id: 'ALT-8802', type: 'Road incursion', ha: 24.4, conf: 0.91, days: 9, coords: '9°52′S 64°14′W' },
  { id: 'ALT-8790', type: 'Canopy thinning', ha: 336.2, conf: 0.78, days: 12, coords: '9°16′S 63°58′W' },
]
