export interface PipeReferenceRow {
  id: string;
  dn: string;
  a: string;
  nps: string;
  odMm: number;
  wallMm: number;
  publishedKgM: number;
  schedule: string;
  standard: string;
}

/**
 * Initial public MVP subset.
 *
 * Standard identity and edition: official ASME metadata.
 * OD, wall thickness and published mass: limited manufacturer cross-check subset.
 * A designation: regional convenience alias, not ASME terminology.
 */
export const pipeSchedule40References: PipeReferenceRow[] = [
  { id: 'dn-50-nps-2-50a', dn: 'DN 50', a: '50A', nps: 'NPS 2', odMm: 60.3, wallMm: 3.91, publishedKgM: 5.44, schedule: 'Schedule 40', standard: 'ASME B36.10-2022' },
  { id: 'dn-65-nps-2-1-2-65a', dn: 'DN 65', a: '65A', nps: 'NPS 2 1/2', odMm: 73.0, wallMm: 5.16, publishedKgM: 8.63, schedule: 'Schedule 40', standard: 'ASME B36.10-2022' },
  { id: 'dn-80-nps-3-80a', dn: 'DN 80', a: '80A', nps: 'NPS 3', odMm: 88.9, wallMm: 5.49, publishedKgM: 11.29, schedule: 'Schedule 40', standard: 'ASME B36.10-2022' },
  { id: 'dn-100-nps-4-100a', dn: 'DN 100', a: '100A', nps: 'NPS 4', odMm: 114.3, wallMm: 6.02, publishedKgM: 16.07, schedule: 'Schedule 40', standard: 'ASME B36.10-2022' },
  { id: 'dn-150-nps-6-150a', dn: 'DN 150', a: '150A', nps: 'NPS 6', odMm: 168.3, wallMm: 7.11, publishedKgM: 28.26, schedule: 'Schedule 40', standard: 'ASME B36.10-2022' },
  { id: 'dn-200-nps-8-200a', dn: 'DN 200', a: '200A', nps: 'NPS 8', odMm: 219.1, wallMm: 8.18, publishedKgM: 42.55, schedule: 'Schedule 40', standard: 'ASME B36.10-2022' },
];

export const pipeLabel = (row: PipeReferenceRow) => `${row.dn} · ${row.a} · ${row.nps}`;
