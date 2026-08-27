// App shell + shared components — strings that are NOT already in `common`.
// Anything generic (nav labels, action verbs, loading/empty copy, the three
// shared filter labels) is reused from the `common` namespace instead of being
// duplicated here; this file only carries shell-specific wording.
//
// Deliberately NOT translated anywhere: 'CSV' / 'PNG' / 'API' / 'ID' / 'GPS'
// tokens, keyboard key names (g, f, Esc, ⌘K), the ErrorBoundary diagnostics
// payload (a developer artefact), and KpiTile's 'MoM' default (a KPI tile is
// too narrow for "ತಿಂಗಳಿಂದ ತಿಂಗಳಿಗೆ"; routes pass their own label when they
// need the long form).
export default {
  // ---- view names (document title, print header, shortcut sections) ----
  'view.caseExplorer': 'Case explorer',
  'view.firDetail': 'FIR detail',
  'view.offender360': 'Offender 360',
  'view.geointelMap': 'GeoIntel map',
  'view.notFound': 'Not found',

  // ---- landmarks / aria ----
  'aria.primaryNav': 'Primary',
  'aria.mainNav': 'Main navigation',
  'aria.primaryTabs': 'Primary tabs',
  'aria.openPalette': 'Open command palette',
  'nav.expandAria': 'Expand navigation',
  'nav.collapseAria': 'Collapse navigation',
  'sidebar.version': 'KSP Datathon 2026 · v0.1',

  'clock.ist': 'Indian Standard Time',

  // ---- refresh / freshness ----
  'refresh.label': 'Refresh all data',
  'refresh.tooltip': 'Refresh all data ({freshness})',
  'refresh.aria': 'Refresh all data — {freshness}',
  'refresh.busy': 'refreshing…',
  'refresh.agoMins': 'updated {n}m ago',
  'refresh.done': 'Data refreshed.',
  'refresh.failed': 'Refresh failed — check the API connection.',

  // ---- topbar filter pill ----
  'filterPill.one': '1 filter',
  'filterPill.many': '{n} filters',
  'filterPill.clearAria': 'Clear all filters ({summary})',

  // ---- copy link ----
  'copyLink.tooltip': 'Copy link to this view',
  'copyLink.done': 'Link copied — filters travel with it.',
  'copyLink.failed': 'Could not copy the link on this browser.',

  // ---- zen mode / theme / density ----
  'zen.label': 'Zen mode (hide chrome for wall displays)',
  'zen.exit': 'Exit zen mode',
  'zen.on': 'Zen mode — chrome hidden. Press f (or use the topbar button) to exit.',
  'theme.toLight': 'Switch to light theme',
  'theme.toDark': 'Switch to dark theme',
  'density.label': 'Table density',
  'toggle.on': 'On',
  'toggle.off': 'Off',

  // ---- mobile More sheet ----
  'more.title': 'More views',
  'more.aria': 'More views',
  'more.language': 'Language · ಭಾಷೆ',

  'install.done': 'DAPPA installed — launch it from your apps like any native tool.',

  // ---- keyboard shortcuts sheet ----
  'shortcuts.onThisView': 'On this view — {name}',
  'shortcuts.everywhere': 'Everywhere',
  'shortcuts.goto': 'Go to… (press g, then a letter)',
  'shortcuts.themeToggle': 'Toggle dark / light theme',
  'shortcuts.thisSheet': 'This shortcuts sheet',
  'shortcuts.closeDialog': 'Close a dialog or sheet',
  'shortcuts.note': 'Shortcuts pause while you type in any input. On GeoIntel, “f” drives the map’s own fullscreen instead.',

  // ---- per-route shortcut rows ----
  'sc.refreshPanels': 'Refresh all panels',
  'sc.autoRefresh': 'Toggle auto-refresh',
  'sc.focusOmnibox': 'Focus the Ask-DAPPA omnibox',
  'sc.mapFullscreen': 'Map fullscreen',
  'sc.playScrubber': 'Play / pause the month scrubber',
  'sc.stepMonths': 'Step months',
  'sc.focusLocate': 'Focus locate search',
  'sc.mapShortcuts': 'Map shortcuts overlay',
  'sc.moveFeed': 'Move through the feed',
  'sc.ackAlert': 'Acknowledge the focused alert',
  'sc.markRead': 'Mark read',
  'sc.snooze': 'Snooze 24 h',
  'sc.copyText': 'Copy as text',
  'sc.unreadOnly': 'Toggle unread-only',
  'sc.severityFilter': 'Severity filter (0 clears)',
  'sc.focusSearch': 'Focus search',
  'sc.exportFilterCsv': 'Export the current filter as CSV',
  'sc.prevNextCase': 'Previous / next case in the filter',
  'sc.findNode': 'Find a node',
  'sc.fitGraph': 'Fit the graph',
  'sc.zoom': 'Zoom',
  'sc.clearSelection': 'Clear selection',
  'sc.focusQuestion': 'Focus the question box',
  'sc.recallHistory': 'Recall input history',
  'sc.stopVoice': 'Stop voice / blur',

  // ---- command palette ----
  'palette.placeholder': 'Jump to a view, filter a district, run an action…',
  'palette.inputAria': 'Search views and actions',
  'palette.resultsAria': 'Results',
  'palette.noMatch': 'Nothing matches “{q}”.',
  'palette.noMatchHint': 'Try a view name like alerts, a district, an offender name, or theme.',
  'palette.searching': 'Searching offenders and case records…',
  'palette.searchingShort': 'searching…',
  'palette.navigate': 'navigate',
  'palette.open': 'open',
  'palette.resultOne': '1 result',
  'palette.resultMany': '{n} results',
  'palette.themeSystem': 'Theme: follow system (auto)',
  'palette.densityToCozy': 'Table density: switch to cozy',
  'palette.densityToCompact': 'Table density: switch to compact',
  'palette.expandSidebar': 'Expand sidebar',
  'palette.collapseSidebar': 'Collapse sidebar',
  'palette.motionReduce': 'Motion: reduce animations',
  'palette.motionRestore': 'Motion: re-enable animations',
  'palette.shortcuts': 'Keyboard shortcuts…',
  'palette.print': 'Print this view',
  'palette.printBrief': 'Open the A4 print brief',
  'palette.install': 'Install DAPPA as an app',
  'palette.clearFilters': 'Clear all filters',
  'palette.filterTo': 'Filter: {name}',
  'palette.openCase': 'Open case record {n}',
  'palette.byCaseId': 'by case ID',
  'palette.searchCases': 'Search case records for “{q}”',
  'palette.caseCount': '{n} cases',
  'palette.switchLang': 'Language: {lang}',

  'section.actions': 'Actions',
  'section.filters': 'Filters',
  'section.savedViews': 'Saved views',
  'section.recent': 'Recent',

  // ---- DataTable ----
  'table.filterRows': 'Filter rows…',
  'table.filterRowsAria': 'Filter rows',
  'table.noRows': 'No rows',
  'table.noRowsMatch': 'No rows match “{q}”.',
  'table.exportAria': 'Export visible rows as CSV',
  'table.exportedOne': 'Exported 1 row to CSV.',
  'table.exportedMany': 'Exported {n} rows to CSV.',
  'table.zeroRows': '0 rows',
  'table.range': '{from}–{to} of {total}',
  'table.prev': '‹ Prev',
  'table.next': 'Next ›',
  'table.prevAria': 'Previous page',
  'table.nextAria': 'Next page',
  'table.sortBy': 'Sort by {column}',

  // ---- FilterBar ----
  'filter.groupAria': 'Filters',
  'filter.views': 'Views',
  'filter.savedViewsAria': 'Saved filter views',
  'filter.savedViewsTitle': 'Saved filter views',
  'filter.nameAria': 'Name for the current filter view',
  'filter.saveHint': 'Set a district, crime head or period first, then save it here as a named view.',
  'filter.noViews': 'No saved views yet — saved combos apply with one tap and survive reloads.',
  'filter.viewSaved': 'View “{name}” saved.',
  'filter.deleteAria': 'Delete saved view {name}',
  'filter.removeAria': 'Remove filter: {label}',
  'filter.chipDistrict': 'District: {name}',
  'filter.chipHead': 'Head: {name}',
  'filter.chipPeriod': 'Period: {label}',
  'filter.chipPeriodRange': 'Period: {from} → {to}',
  'filter.districtN': 'District {id}',
  'filter.headN': 'Head {id}',

  // ---- ChartPanel ----
  'chart.word': 'chart',
  'chart.downloadPng': 'Download PNG',
  'chart.downloadAria': 'Download {title} as PNG',
  'chart.expand': 'Expand chart',
  'chart.expandAria': 'Expand {title} to fullscreen',
  'chart.expandedAria': '{title} — expanded view',
  'chart.closeExpanded': 'Close expanded chart',
  'chart.retryAria': 'Retry loading {title}',
  'chart.failed': 'Chart failed to load',
  'chart.failedMessage': 'The data for this chart could not be loaded.',
  'chart.noPlot': 'Nothing to plot for the current filters.',

  // ---- ErrorBoundary ----
  'error.title': 'Something broke while rendering {view}.',
  'error.thisView': 'this view',
  'error.staleTitle': 'A newer version of DAPPA was deployed.',
  'error.staleMessage': 'This session is holding stale app files — reload to pick up the new build. Nothing is lost; filters live in the URL.',
  'error.reload': 'Reload app',
  'error.backToDashboard': '← Dashboard',
  'error.copyDetails': 'Copy error details',
  'error.copied': 'Copied ✓',
  'error.technical': 'Technical details',

  // ---- OfflineBanner ----
  'offline.back': 'Back online — data will refresh.',
  'offline.message': 'You are offline — showing cached data.',
  'offline.messageFor': 'You are offline for {elapsed} — showing cached data.',
  'offline.elapsedMins': '{n}m',
  'offline.elapsedHours': '{h}h {m}m',
  'offline.checkNow': 'Check now',
  'offline.checking': 'Checking…',

  // ---- PrintHeader ----
  'print.fullName': 'Data Analytics & Predictive Policing Assistant',
  'print.generated': 'Generated {stamp} IST',
  'print.synthetic': 'Synthetic demonstration data — not real records',
  'print.filters': 'Filters:',

  // ---- toasts ----
  'toast.region': 'Notifications',
  'toast.dismissAll': 'Dismiss all ({n})',
  'toast.dismissAria': 'Dismiss {tone} notification',
  'toast.toneSuccess': 'success',
  'toast.toneError': 'error',
  'toast.toneInfo': 'info',

  // ---- small shared components ----
  'sheet.aria': 'Sheet',
  'tabs.aria': 'Tabs',
  'action.backToTop': 'Back to top',
  'delta.up': 'up',
  'delta.down': 'down',
  'delta.flat': 'unchanged',
  'map.unavailable': 'Map unavailable',
  'map.geoFail': 'Could not load the Karnataka district GeoJSON.',
};
