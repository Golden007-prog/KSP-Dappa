// Accessibility layer strings (Phase 5): chart text alternatives, screen-reader
// live announcements, the text-size control and the ticker's pause / tone words.
export default {
  'chart.col.category': 'Category',
  'chart.col.value': 'Value',
  'chart.col.series': 'Series',
  'chart.col.metric': 'Metric',
  'chart.col.x': 'X',
  'chart.col.y': 'Y',
  'chart.kind.line': 'line chart',
  'chart.kind.bar': 'bar chart',
  'chart.kind.pie': 'pie chart',
  'chart.kind.scatter': 'scatter plot',
  'chart.kind.heatmap': 'heat map',
  'chart.kind.radar': 'radar chart',
  'chart.kind.gauge': 'gauge',
  'chart.kind.funnel': 'funnel chart',
  'chart.kind.generic': 'chart',
  'chart.a11y.titled': 'Chart: {title}',
  'chart.a11y.untitled': 'Chart',
  'chart.a11y.head': '{title}: {kind}.',
  'chart.a11y.headNoTitle': 'A {kind}.',
  'chart.a11y.span': '{n} categories from {first} to {last}.',
  'chart.a11y.seriesCount': '{n} series.',
  'chart.a11y.largest': 'Largest: {name} at {value}.',
  'chart.a11y.range': '{name} ranges from {min} to {max}.',
  'chart.a11y.values': 'Values',
  'chart.tableCaption': 'Data behind this chart',
  'chart.tableTruncated': 'Showing the first {n} of {total} rows.',
  'chart.table': 'Table',
  'chart.showTable': 'Table view',
  'chart.showChart': 'Chart view',
  'chart.showTableAria': 'Show {title} as a table',
  'chart.showChartAria': 'Show {title} as a chart',

  // Labels for horizontally scrolling boxes. They carry tabindex=0 so a
  // keyboard user can scroll them (WCAG 2.1.1), which makes them landmarks —
  // a landmark without a name is worse than none, so every one is named.
  'scroll.table': 'Scrollable table: {name}',
  'scroll.panel': 'Scrollable panel: {name}',
  'scroll.rows': 'Scrollable results table',
  'scroll.chartTable': 'Scrollable table of the chart values',
  'scroll.digest': 'Scrollable digest text',

  // Per-route document titles the nav table cannot produce (lib/a11y.js
  // useDocumentTitle); the " — KSP DAPPA" suffix is added by formatDocumentTitle.
  'title.case': 'Case {no}',
  'title.offender': '{name} · Offender 360',

  'live.results': '{n} results',
  'live.resultOne': '1 result',
  'live.rowsLoaded': '{n} rows loaded',
  'live.noRows': 'No rows match',
  'live.filtersApplied': 'Filters applied: {summary}',
  'live.filtersCleared': 'Filters cleared',
  'live.viewLoaded': '{view} loaded',
  'live.error': 'Error: {message}',
  'live.chartFailed': '{title} could not be loaded',
  'live.page': 'Page {page} of {pages}',

  'fontSize.label': 'Text size',
  'fontSize.normal': 'Normal',
  'fontSize.large': 'Large',
  'fontSize.toLarge': 'Larger text',
  'fontSize.toNormal': 'Normal text size',

  'ticker.pause': 'Pause the ticker',
  'ticker.resume': 'Resume the ticker',
  'ticker.toneUp': 'Rising',
  'ticker.toneDown': 'Falling',
  'ticker.toneAlert': 'Alert',
  'ticker.toneInfo': 'Note',
};
