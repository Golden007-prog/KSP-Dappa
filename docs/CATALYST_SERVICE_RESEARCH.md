# Catalyst service inventory — research for the Round-2 build

*Researched 27 August 2026 against docs.catalyst.zoho.com, the free-tier page, the npm registry, the
catalystbyzoho GitHub org, and the `zcatalyst-sdk-node@3.4.0` package installed under
`functions/dappa_api/node_modules`. Every claim carries the URL it was read on. **VERIFIED** means the
sentence was read on that page (or in the installed SDK's `.d.ts`); **INFERRED** means it is my
deduction from verified facts. Where a page was inaccessible (HTTP 404) I say so instead of guessing.
Nothing here is a build instruction; it is the evidence base for deciding what to build.*

Two facts frame everything below:

1. **DAPPA runs in the IN data centre.** The project domain is
   `project-rainfall-60079891305.development` (`.catalystrc`) and the deployed URL ends in
   `.development.catalystserverless.in` (`README.md` § environment variables, `docs/ROUND2_BASELINE.md` § 4).
   Several Catalyst services are documented as unavailable to IN-DC users; see § 2.
2. **The installed SDK is `zcatalyst-sdk-node@3.4.0`** (`functions/dappa_api/package.json` pins `^3.0.0`;
   `node_modules/zcatalyst-sdk-node/package.json` says `3.4.0`; the npm registry's `latest` is also
   `3.4.0` — VERIFIED at [registry.npmjs.org/zcatalyst-sdk-node/latest](https://registry.npmjs.org/zcatalyst-sdk-node/latest)).
   The public Node.js reference is still labelled "v2" and its overview names
   `zcatalyst-sdk-node@2.5.0` ([Node.js SDK overview](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/overview/)).
   Every method name quoted below from the v2 docs was cross-checked against the 3.4.0 `.d.ts` files
   and exists with the same name; where 3.4.0 has methods the docs do not, I say so (§ 16).

---

## 1. Documentation map (what exists)

The docs root ([docs.catalyst.zoho.com/en/](https://docs.catalyst.zoho.com/en/)) lists these products
(VERIFIED): **AI Toolkit** (Context for LLMs, Catalyst MCP Server, Catalyst AI Plugin); **Core services**
Serverless, Cloud Scale, Zia Services, DevOps, SmartBrowz, ConvoKraft, Job Scheduling, Slate, Pipelines,
QuickML, Signals; **Developer tools** CLI, Java/Node.js/JavaScript/Python/Web/Android/iOS/Flutter SDKs,
REST API, VS Code extension, Integrations, Tools; **Solutions** CodeLib, Tutorials, Release Notes,
Deployment & Billing, FAQ.

Service index pages and their components (all VERIFIED on the index page named):

| Index | Components |
|---|---|
| [Serverless](https://docs.catalyst.zoho.com/en/serverless/) | Functions, Security Rules, AppSail, Circuits |
| [Cloud Scale](https://docs.catalyst.zoho.com/en/cloud-scale/) | Data Store, NoSQL, Stratus, Cache, Search, ZCQL, Authentication, API Gateway, Connections, Cron, Mail, Push Notifications, Web Client Hosting, Domain Mappings, Mobile Device Management |
| [Zia Services](https://docs.catalyst.zoho.com/en/zia-services/) | Face Analytics, OCR, Identity Scanner, Image Moderation, Object Recognition, Barcode Scanner, Text Analytics |
| [DevOps](https://docs.catalyst.zoho.com/en/devops/) | Application Alerts, APM, Logs, Metrics, GitHub Integration, Automation Testing |
| [QuickML](https://docs.catalyst.zoho.com/en/quickml/) | Data Connectors, Data Profiler, Visualization, Preprocessing, Dataset Extraction, Zia Features, ML Algorithms, ML Operations, LLM Serving, RAG, Knowledge Base, Pipeline Builder, Pipeline Endpoints (+ Custom Code and AutoML pipeline pages found by search, § 6) |
| [SmartBrowz](https://docs.catalyst.zoho.com/en/smartbrowz/) | Headless, Browser Grid, Browser Logic, PDF & Screenshot, Templates, Dataverse (beta) |

The **Node.js SDK v2** nav ([overview](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/overview/), VERIFIED)
documents: Authentication, Data Store, NoSQL, Stratus, Cache, Connections, Search, ZCQL, Mail, Push
Notifications, Functions, Circuits, OCR, Face Analytics, Text Analytics (plus Identity Scanner, Image
Moderation, Object Recognition, Barcode, AutoML pages reachable from the
[Zia instance page](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/get-component-instance/)),
Job Scheduling, Pipelines, QuickML, SmartBrowz. File Store still has a v2 page
([get-component-instance](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/file-store/get-component-instance/)).
Not in the SDK: Signals publishing, ConvoKraft (browser widget only), Slate, Domain Mappings, API Gateway,
Logs/APM/Metrics/Alerts, MDM.

Initialisation is the same for all function types (VERIFIED on the overview):
`const app = catalyst.initialize(req)` in Advanced I/O, `catalyst.initialize(context)` in Basic I/O,
Event and Cron functions. The accessors on the 3.4.0 `CatalystApp` class are (VERIFIED in
`lib/catalyst-app.d.ts`): `cache() cron() jobScheduling() datastore() filestore() zcql() email() search()
functions() userManagement() pushNotification() zia() circuit() smartbrowz() quickML() pipeline() nosql()
stratus() connections()`.

A useful docs feature: append `/index.md` to any help page to get clean markdown, or fetch
[`/en/llms-full.txt`](https://docs.catalyst.zoho.com/en/llms-full.txt) for the whole site
([Context for LLMs](https://docs.catalyst.zoho.com/en/ai-toolkit/context-serve/), VERIFIED).

---

## 2. Data-centre availability matrix (read this before adding anything)

Every restriction below is a verbatim "not available to Catalyst users accessing from …" sentence on the page cited. DAPPA is IN-DC.

| Service | Restriction (VERIFIED) | Usable by DAPPA (IN)? |
|---|---|---|
| **Circuits** | "Circuits is currently not available to Catalyst users accessing from the EU, AU, IN, JP, SA or CA data centers." — [intro](https://docs.catalyst.zoho.com/en/serverless/help/circuits/introduction/), [SDK instance](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/serverless/circuits/get-a-component-instance/), [SDK execute](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/serverless/circuits/execute-circuit/); the Job Scheduling pages repeat "EU, AU, IN, or CA" ([jobs](https://docs.catalyst.zoho.com/en/job-scheduling/help/job/introduction/)) | **No** |
| **Zia AutoML** | "AutoML is currently not available to Catalyst users accessing from the EU, AU, IN, JP, SA or CA data centers." — [SDK automl](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/automl/) | **No** |
| **Integration Functions** | "Integration functions is currently not available to Catalyst users accessing from the EU, AU, IN, or CA data centers." — [Functions intro](https://docs.catalyst.zoho.com/en/serverless/help/functions/introduction/) | **No** (matters for ConvoKraft actions, § 8) |
| **Automation Testing** | unavailable for "users accessing from the EU, AU, IN, or CA data centers" — [intro](https://docs.catalyst.zoho.com/en/devops/help/automation-testing/introduction/) | **No** |
| **Mobile Device Management** | "not available to Catalyst users accessing from the EU, AU, IN, JP, SA or CA data centers." — [intro](https://docs.catalyst.zoho.com/en/cloud-scale/help/mobile-device-management/introduction/) | No (irrelevant) |
| **SmartBrowz Dataverse** | "only available to users whose accounts are registered in the US data center" — [intro](https://docs.catalyst.zoho.com/en/smartbrowz/help/dataverse/introduction/) | No (irrelevant) |
| **Identity Scanner — document processing** (Aadhaar/PAN/cheque/passbook) | "only available in the IN DC. This feature will not be available to users accessing from the EU, AU, US, JP, SA or CA data centers." — [Aadhaar SDK](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/identity-scanner/aadhaar/), [PAN SDK](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/identity-scanner/pan/), [passbook](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/identity-scanner/passbook/) | **Yes — IN only** |
| **Identity Scanner — facial comparison** | "accessing and testing Facial Comparison or E-KYC from the Catalyst console is restricted to the users from IN DC alone" — [SDK facial comparison](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/identity-scanner/facial-comparison/); the [intro](https://docs.catalyst.zoho.com/en/zia-services/help/identity-scanner/introduction/) says facial comparison itself is globally available | **Yes** |
| **QuickML (pipelines)** | "not available to users accessing from the CA (Canada), JP (Japan) or SA (Saudi Arabia) data centers." — [getting started](https://docs.catalyst.zoho.com/en/quickml/getting-started/introduction/) | Yes |
| **QuickML LLM Serving / RAG / Knowledge Base** | "available in US, IN, and EU data centers" — [LLM serving](https://docs.catalyst.zoho.com/en/quickml/help/generative-ai/llm-serving/), [RAG](https://docs.catalyst.zoho.com/en/quickml/help/generative-ai/rag/), [Knowledge Base](https://docs.catalyst.zoho.com/en/quickml/help/generative-ai/knowledge-base/) | Yes |
| **QuickML Custom Code** | "available in early access across all the data centers. To use this feature, request access via support@zohocatalyst.com" — [custom code](https://docs.catalyst.zoho.com/en/quickml/help/custom-code/) | Yes, after a support request |
| **APM** | "not available to users accessing from the CA (Canada) data center." — [intro](https://docs.catalyst.zoho.com/en/devops/help/apm/introduction/) | Yes |
| Face Analytics, OCR, Object Recognition, Barcode, Image Moderation, Text Analytics | No DC restriction sentence found on the intro, key-concepts or SDK pages (checked: [face](https://docs.catalyst.zoho.com/en/zia-services/help/face-analytics/key-concepts/), [OCR](https://docs.catalyst.zoho.com/en/zia-services/help/optical-character-recognition/key-concepts/), [object](https://docs.catalyst.zoho.com/en/zia-services/help/object-recognition/key-concepts/), [barcode](https://docs.catalyst.zoho.com/en/zia-services/help/barcode-scanner/key-concepts/), [text](https://docs.catalyst.zoho.com/en/zia-services/help/text-analytics/key-concepts/)) | Yes (INFERRED from absence) |
| Data Store, NoSQL, Stratus, Cache, Search, Mail, Push, Auth, Cron, Job Scheduling, Signals, SmartBrowz PDF, Slate, Pipelines, ConvoKraft | No DC sentence found on the pages read | Yes (INFERRED from absence) |

**Consequence for `servicemap.js`:** the rows `circuits` and `zia-automl` are marked `console-pending`
("flag on but CIRCUIT_ID / ZIA_AUTOML_MODEL_ID not set"). In the IN DC no console step can ever set them:
the circuit editor and the AutoML model trainer are not offered. Those two rows should be reclassified
(e.g. `unavailable-in-dc`) rather than left as pending console work. Job Scheduling's "Circuit" target is
unusable for the same reason.

The DC list itself: the FAQ does not enumerate DCs ([FAQ general](https://docs.catalyst.zoho.com/en/faq/general/),
VERIFIED — only mentions a cross-DC email error). The restriction sentences name US, EU, IN, AU, JP, SA, CA;
CLI 1.23.0 "adds UAE data centre support" ([release notes](https://docs.catalyst.zoho.com/en/release-notes/all/)).

---

## 3. Serverless

### 3.1 Functions
- Types (VERIFIED, [intro](https://docs.catalyst.zoho.com/en/serverless/help/functions/introduction/)): Basic I/O ("passing a String as the I/O parameter"), Advanced I/O ("support Headers, and Native Request and Response objects"), Event ("invoked by specific events configured using Catalyst Signals"), Cron, Integration ("integrate with other Zoho services"; not in IN DC), plus Job Functions and Browser Logic in the nav. Job Functions: "invoke when a job is executed in a Function Job Pool", handler `(jobRequest, context)`, "maximum execution time … a constant value of 15 minutes" ([job functions](https://docs.catalyst.zoho.com/en/serverless/help/functions/job-functions/)).
- Timeouts (VERIFIED, [Serverless FAQ](https://docs.catalyst.zoho.com/en/faq/serverless/)): "The execution time limit for Basic I/O and Advanced I/O functions is 30 seconds." "The execution time limit for Event and Cron functions is 15 minutes." Concurrency: "1500 concurrent executions for a function that runs for 10 ms in the production environment, and 1000 … in the development environment."
- Advanced I/O URL (VERIFIED, [advanced-io](https://docs.catalyst.zoho.com/en/serverless/help/functions/advanced-io/)): dev `https://<project_domain>.development.catalystserverless.com/server/<function_name>/`, prod without `.development`. Express is the named Node framework.
- Runtimes: the intro pages do not list versions; the [release notes](https://docs.catalyst.zoho.com/en/release-notes/all/) (Jun 2026) say CLI 1.26.0 "adds runtime support for Java 21, 25, Node 22, 24, Python 3.10-3.13" and Python 3.9 enters deprecation (VERIFIED). DAPPA's Node 20 and Python 3.12 are inside that range (INFERRED).
- SDK: `app.functions().execute(<id or name>, { args: {...} })` — "accepts either a function ID (numeric) or function name (string)" ([execute-function](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/serverless/functions/execute-function/), VERIFIED; local `functions.d.ts` exposes `execute`).
- Free tier: "25k GB-seconds free requests per month" ([free tier](https://catalyst.zoho.com/free-tier.html)).
- Console step: none for code; security rules are auto-created on deploy (§ 3.2).

### 3.2 Security Rules
"define the invocation and access rules of your Catalyst Basic I/O and Advanced I/O functions" — HTTP methods and whether auth is "required or optional"; a JSON file; "created for it automatically" on deploy; "do not define configurations for Cron and Event functions" ([intro](https://docs.catalyst.zoho.com/en/serverless/help/security-rules/introduction/), VERIFIED). REST/config only — no SDK.

### 3.3 AppSail
"A fully-managed, independent, platform for deploying web services"; runtimes Java (Jetty, Spring), Node.js (Express, Hapi, Koa, Fastify, Restify), Python (Flask, Django, Bottle, CherryPy, Tornado), custom OCI images for "Linux AMD64 (x86-64)"; deploy from console (upload) or `catalyst deploy` ([intro](https://docs.catalyst.zoho.com/en/serverless/help/appsail/introduction/), VERIFIED). Free tier "15 GB-hours free per month" ([free tier](https://catalyst.zoho.com/free-tier.html)). No SDK method — it is a deploy target; Job Scheduling can call an AppSail endpoint (§ 10). Memory/scaling limits not on the intro page (gap).

### 3.4 Circuits — full section
- Definition (VERIFIED, [intro](https://docs.catalyst.zoho.com/en/serverless/help/circuits/introduction/)): "a JSON file that helps you systematically define and organize a sequence of tasks"; "You can either visually design the schematics of a circuit by dragging and dropping its elements, or build its JSON code in the Catalyst console." Only Basic I/O functions: "You will not be able to execute Cron, Event, or Advanced I/O functions in a Catalyst circuit."
- States (VERIFIED, [key concepts](https://docs.catalyst.zoho.com/en/serverless/help/circuits/key-concepts/)): Function (errors TimeOut / Authorization Failure / Execution Failure with Retry and Fallback), Circuit (nested), Pass, Branch (operators `==, !=, <, <=, >, >=, =~, in, nin, size, empty`), Parallel, Wait, Batch ("maximum 10 concurrent jobs"), Success, Failure; Input/Output/Result Path use JsonPath. REST execute URL: `https://<project_domain>.<env>.zohocatalyst.com/baas/v1/project/<project_ID>/circuit/<circuit_ID>/execute` (POST).
- Console (VERIFIED, [implementation](https://docs.catalyst.zoho.com/en/serverless/help/circuits/implementation/)): "upto 50 circuits in a project in the development environment"; creation yields a Circuit ID (for SDK/API) and a Reference Name; "Save and Execute" runs a named test case; "View Execution History" shows per-state payload/response/exception logs.
- SDK (VERIFIED, [execute-circuit](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/serverless/circuits/execute-circuit/); local `circuit.d.ts` has `execute status abort`):
  ```js
  circuit.execute('195000000041001', 'sampleName', { name: 'Aaron Jones' })  // (circuitId, executionName, input)
  circuit.status('195000000041001', '195000000043002')                          // (circuitId, executionId)
  circuit.abort('195000000041001', '195000000043002')
  ```
  Execute response: `{ id, name, start_time, status: "running", status_code: 1, execution_meta, circuit_details: { name, ref_name, description, instance_id }, input }`. Polling = call `status()` until `status` leaves `running`; the docs show `running` and `status_code: 1` only, so the full status vocabulary is a gap (the console log page names success/failure states).
- Availability: **not in IN DC** (§ 2). Free tier "2000 state transitions free per month" ([free tier](https://catalyst.zoho.com/free-tier.html)). DAPPA's `lib/circuits.js` already calls `execute(CIRCUIT_ID, name, input)` and `status(id, execId)` in the documented shape (VERIFIED locally), but it can never be exercised from this DC.

---

## 4. Cloud Scale

### 4.1 Data Store
- "cloud-based relational database management system"; "Supports Bulk Read, Bulk Write, and Bulk Delete"; "advanced search on the indexed columns using Catalyst Search"; a "Built-in OLAP database" ([intro](https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/introduction/), VERIFIED).
- Columns (VERIFIED, [columns](https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/columns/)): types Text (10,000 chars), Var Char (255), Date, DateTime, Int, Double, Boolean, BigInt, Foreign Key, Encrypted text; constraints Search Index, IsUnique, IsMandatory, Default Value, PII/ePHI validator; "Search Index and Default Value are unavailable for the Text data type only"; dev limit "Up to 100 columns per table", production "no upper limits".
- Table creation is console: "Navigate to Data Store under Storage in the Catalyst Cloud Scale console" ([tables](https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/tables/), VERIFIED); no SDK/CLI creation is mentioned (matches the project memory "console-only table creation").
- ZCQL limits (VERIFIED via [search result quoting the SELECT page](https://docs.catalyst.zoho.com/en/cloud-scale/help/zcql/select/)): "maximum of 20 columns and a maximum of 300 rows in one SELECT query"; page with `LIMIT OFFSET, VALUE` ([limit](https://docs.catalyst.zoho.com/en/cloud-scale/help/zcql/limit/)). DAPPA pages at 300 (`servicemap.js` row data-store) — consistent.
- SDK: `app.datastore()`; pages for get-table-meta, get-table-instance, get-column-meta, get-rows, insert-rows, update-rows, delete-row, bulk-read, bulk-write, bulk-delete-rows ([nav](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/data-store/get-component-instance/), VERIFIED). `app.zcql().executeZCQLQuery(query)` "returns a promise … The content key will contain the array of row objects" ([execute-zcql-query](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/zcql/execute-zcql-query/), VERIFIED).
- **OLAP database** (new, relevant): "A built-in proprietary OLAP … database feature, exclusively built to handle analytical queries that you run on the Data Store"; "With a single one-time action, you can enable automated synchronization of the data from the primary Data Store's database to the OLAP database" ([OLAP intro](https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/olap-database/introduction/), VERIFIED). Console: "Navigate to Data Store in CloudScale, then click the OLAP Database tab. Click Enable"; the ZCQL console has an "Execute on: OLAP DB" switch ([enable and query](https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/olap-database/enable-and-query/), VERIFIED). SDK: the v2 execute-zcql page "references `executeOLAPQuery()` as a separate method" (VERIFIED on that page); the docs page `/execute-olap-query/` is **404**; the installed 3.4.0 `zcql.d.ts` declares `executeOLAPQuery(sql: string): Promise<Array<ICatalystTableData>>` with the example `app.zcql().executeOLAPQuery('SELECT COUNT(Id) FROM Employees GROUP BY Department')` and the implementation sends `OLAP: true` (VERIFIED locally). No DC restriction or sync-latency figure is stated (gap).
- Free tier: Select 10,000 / Insert 5,000 / Update 1,000 / Delete 1,000 requests per month ([free tier](https://catalyst.zoho.com/free-tier.html)).

### 4.2 Search (full-text) — full section
- "enables data searching within the indexed columns of your Catalyst Data Store tables" ([intro](https://docs.catalyst.zoho.com/en/cloud-scale/help/search-integration/introduction/), VERIFIED).
- **How columns become searchable:** "Catalyst Search is only available for columns whose Search Index constraint is enabled in the Data Store"; ROWID cannot be indexed, CREATORID/CREATEDTIME/MODIFIEDTIME are indexed automatically ([key concepts](https://docs.catalyst.zoho.com/en/cloud-scale/help/search-integration/key-concepts/), VERIFIED). The constraint is a per-column property in the Data Store column editor ([columns](https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/columns/)); it "will create a full-text search index for the column"; not available on the Text type. The Search page in the console ("Enable Data Searching") "displays a list of all indexed columns in every table" grouped by table with data types, and provides the code template ([implementation](https://docs.catalyst.zoho.com/en/cloud-scale/help/search-integration/implementation/), VERIFIED). Query semantics on the same page: multiple space-separated keywords return results per keyword; wildcard `c*`; `sortBy`.
- Consequence for DAPPA: `CaseMaster.BriefFacts`-style long narratives are almost certainly **Text** columns (10,000 chars) and therefore cannot be indexed — only Var Char columns can (INFERRED from the column rules; check the actual column types in the console). The `data-store-search` row's "until the columns are marked searchable" note should name which Var Char columns to flag.
- SDK (VERIFIED, [search-data](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/search/search-data/); local `search.d.ts` `executeSearchQuery(searchQuery: ICatalystSearch)`):
  ```js
  const config = { search: 'santh*', search_table_columns: { SampleTable: ['SearchIndexedColumn'], Users: ['SearchTest'] } };
  const result = await app.search().executeSearchQuery(config);   // → { TableName: [ {ROWID, ...columns} ] }
  ```
  The docs page shows only `search` and `search_table_columns`; `select_table_columns`, `order_by`, `start`, `end` are not on the page (gap — DAPPA's `lib/search.js` should not rely on them without checking the 3.4.0 `ICatalystSearch` type).
- Free tier "1000 queries free per month".

### 4.3 NoSQL
"fully-managed … non-relational" store; items are "a collection of attributes", max item size **400 KB**; partition key + optional sort key; "up to 5 additional sort keys"; TTL attribute with epoch timestamps, sweeper "once every 24 hours"; custom JSON typing (`S`, `N`, `L`, `M`) ([components](https://docs.catalyst.zoho.com/en/cloud-scale/help/nosql/components/), VERIFIED). Tables are created in the console ([intro](https://docs.catalyst.zoho.com/en/cloud-scale/help/nosql/introduction/)). SDK: `app.nosql()` with pages get-table-metadata, get-table-instance, construct-item, insert-items, update-items, fetch-items, query-table, query-index, delete-items ([nav](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/nosql/get-component-instance/), VERIFIED); local `no-sql` module exposes `getTable fetchItem insertItems updateItems deleteItems queryTable queryIndex` (VERIFIED). DAPPA's `table.fetchItem({ keys: [{ partition_key: { name: { S: 'graph' } } }] })` matches the typed-attribute format. Free-tier row for NoSQL not on the free-tier page (gap).

### 4.4 Stratus
"store any type of data as objects within containers called buckets"; versioning, "encryption at rest and encryption at flight", PII/ePHI mode, CORS, malware scanning, Signals triggers ([intro](https://docs.catalyst.zoho.com/en/cloud-scale/help/stratus/introduction/), VERIFIED). SDK (VERIFIED): `bucket.putObject(key, body, options)` with string or stream body, multipart recommended "for objects that are 100 MB or larger" ([upload-object](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/stratus/upload-object/)); `bucket.generatePreSignedUrl("sam/out/sample.txt", 'GET', { expiryIn: 100, activeFrom, versionId })` returning the signed URL, expiry seconds and active_from ([download-object](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/stratus/download-object/)). The [overview](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/stratus/overview/) lists pre-signed URLs for both download and upload, list/paged/iterable objects, copy/rename/move, delete/truncate, unzip, object versions, metadata. Local 3.4.0 `stratus` module has `putObject getObject headObject generatePreSignedUrl generateCacheSignedUrl purgeCache listPagedObjects listIterableObjects initiateMultipartUpload uploadPart completeMultipartUpload unzipObject deleteObject deleteObjects deletePath truncate renameObject copyObject putMeta` (VERIFIED). Object-size and bucket-count limits are not on the intro page (gap). Console: buckets are created in the console (DAPPA's bucket `dappa` already exists per `servicemap.js`).

### 4.5 File Store (legacy)
"provides cloud storage to securely store, manage, and organize both application files and user data"; dev "1 GB per project"; "No sub-folders"; page carries a note recommending Stratus as "a significant upgrade to the current Cloud Scale File Store component" ([intro](https://docs.catalyst.zoho.com/en/cloud-scale/help/file-store/introduction/), VERIFIED). Not on the Cloud Scale index any more (VERIFIED absence on [cloud-scale](https://docs.catalyst.zoho.com/en/cloud-scale/)). SDK page still exists: `app.filestore()` ([SDK](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/file-store/get-component-instance/)); local module `file` present. Free tier: 5 GB storage, 10,000 downloads, 2,000 uploads per month ([free tier](https://catalyst.zoho.com/free-tier.html)). Console step: create the folder (DAPPA's `FILESTORE_FOLDER_ID`). Recommendation (INFERRED): treat the `file-store` row as legacy; Stratus already covers it.

### 4.6 Cache
"small storage component … sub-millisecond responses"; segments partition memory ([intro](https://docs.catalyst.zoho.com/en/cloud-scale/help/cache/introduction), VERIFIED). SDK: `cache.segment().put('Name', 'Linda McCartney', 1)` — key/value strings, expiry in **hours**, "Default expiry: 48 hours"; response has `expires_in`, `expiry_in_hours`, `ttl_in_milliseconds` ([insert](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/cache/insert-data-into-cache/), VERIFIED). Local module: `segment put get getValue update delete getAllSegment getSegmentDetails`. Max value size and max expiry not stated (gap). Free tier: GET 1,000; PUT/UPDATE 5,000 each per month.

### 4.7 Authentication — full section
- Types: Hosted, Embedded, Third-party — "You can implement one instance of each authentication type in each of your Catalyst applications" ([authentication types](https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/authentication-types/), VERIFIED). Social logins Google and Zoho ([intro](https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/introduction/)). Web SDK sign-in embed: `catalyst.auth.signIn("your element id")` after loading `https://static.zohocdn.com/catalyst/sdk/js/4.0.0/catalystWebSDK.js` and `/__catalyst/sdk/init.js` ([Web SDK overview](https://docs.catalyst.zoho.com/en/sdk/web/v4/overview/), VERIFIED).
- Roles (VERIFIED, [roles intro](https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/user-management/roles/introduction/)): defaults **App Administrator** ("admin access … by default" but per-table permissions customisable) and **App User** ("end-user level access"; custom roles without scopes inherit it); a role can be the default role auto-assigned to new users; roles "apply to the Data Store, Search, and ZCQL".
- User object (VERIFIED, [get-user-details](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/authentication/get-user-details/)): `{ zuid, zaaid, org_id, status: "ACTIVE", is_confirmed, email_id, last_name, created_time, role_details: { role_name: "App User", role_id }, user_type, user_id, locale, time_zone, project_profiles }` — so `role_details.role_name` is the field to gate admin actions on.
- SDK methods (VERIFIED nav + local `user-management.d.ts`): `getCurrentUser() getUserDetails(userId) getAllUsers() registerUser(signupConfig, userConfig) addUserToOrg(...) getAllOrgs() resetPassword(...) generateCustomToken(...) getSignupValidationRequest(...) updateUserDetails(...) updateUserStatus(...) deleteUser(...)`. `registerUser` takes `signupConfig { platform_type: 'web', template_details: { senders_mail, subject, message }, redirect_url }` and `userConfig { first_name, last_name, email_id, role_id }` ([add-new-user](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/authentication/add-new-user/)). Limit: "Development environments limit registrations to 25 users; production allows unlimited end-users" (same page, VERIFIED).
- Console: roles and email templates are console objects; the `role_id` must be copied from the console.

### 4.8 API Gateway
"create, maintain, and monitor HTTP requests"; routes to Basic I/O, Advanced I/O and the web client; "an optional, paid component" ([intro](https://docs.catalyst.zoho.com/en/cloud-scale/help/api-gateway/introduction/), VERIFIED). Key concepts (VERIFIED, [key concepts](https://docs.catalyst.zoho.com/en/cloud-scale/help/api-gateway/key-concepts/)): enabling it disables Security Rules; methods incl. `ANY`; request URL and target URL configured separately; auth = API Key (header `ZCFKEY` or query), Catalyst Users, OAuth; throttling general ("50 requests in 2 minutes") and per-IP, sliding window, HTTP 429. Free tier "100,000 APIs free per month". Console-only; DAPPA's `api-gateway` row says throttling is enforced in-function — accurate wording since the gateway's own throttling is a console rule (INFERRED).

### 4.9 Connections
"authenticate and integrate with Zoho services and third-party applications"; 23 Zoho + 6 third-party default services; custom services with OAuth2/API key/Basic ([intro](https://docs.catalyst.zoho.com/en/cloud-scale/help/connections/introduction/), VERIFIED). SDK: `app.connections().getConnectionCredentials('payrollcon')`; "This SDK can only be accessed within Catalyst services like Functions and AppSail" ([get-credentials](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/connections/get-credentials/), VERIFIED). Node SDK 3.2.0 added it ([release notes](https://docs.catalyst.zoho.com/en/release-notes/all/)). Console: create the connection and copy its link name.

### 4.10 Cron (legacy scheduler)
Targets "Third-party URLs", "Cron functions", "Circuit"; once or recurring; the page says "Catalyst now offers you a brand new scheduling service called Job Scheduling in Early Access mode" ([intro](https://docs.catalyst.zoho.com/en/cloud-scale/help/cron/introduction/), VERIFIED). Local SDK `cron` module: `createCron getAllCron getCronDetails updateCron deleteCron` (VERIFIED). Free-tier row for Cron not on the free-tier page.

### 4.11 Mail — full section
- Sender verification (VERIFIED, [email configuration](https://docs.catalyst.zoho.com/en/cloud-scale/help/mail/email-configuration/)): Notify → Mail → Add Email Address → enter display name + address → a confirmation code is emailed → enter it → Confirm. "you need verify both the sender email address and the domain".
- Domains (VERIFIED, [domains](https://docs.catalyst.zoho.com/en/cloud-scale/help/mail/domains/)): "You will not be able to verify public domain email addresses such as Gmail and Yahoo Mail, and hence not be able to send emails through Catalyst Mail using them." Private domains need SPF and DKIM DNS records issued by Catalyst. **So `MAIL_FROM` must be an address on a domain the team controls DNS for; a Gmail sender is impossible.** (The intro's "public domain email addresses directly without configuring their SMTP settings" refers to Zoho-hosted public addresses; the domains page is the binding rule — INFERRED reconciliation.)
- Limits per send (VERIFIED, [send emails](https://docs.catalyst.zoho.com/en/cloud-scale/help/mail/send-emails/)): To 10, CC 10, BCC 5, Reply-to 5, 5 attachments, 15 MB total; "No emails can be sent without the verification being done" — an exception is thrown. Free tier "100 emails free per month".
- SDK (VERIFIED, [send-email](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/mail/send-email/)): `app.email().sendMail({ from_email, to_email: [...], cc, bcc, reply_to, subject, content, attachments: [fs.createReadStream('kycform.pdf')] })`; response echoes the config with `html_mode: true` and `project_details`. DAPPA's `lib/mail.js` shape matches.

### 4.12 Push Notifications — full section
- Web registration (VERIFIED, [web push](https://docs.catalyst.zoho.com/en/cloud-scale/help/push-notifications/web/)): console → Cloud Scale → Push Notifications → Web tab gives a snippet; the client calls
  ```js
  catalyst.notification.enableNotification().then(resp => { catalyst.notification.messageHandler = msg => { /* action */ } });
  ```
  "The code snippet … also handles the registration process of the user devices"; recipients are addressed by **email ID** ("Enter the email ID of the user account"); recipient must have the web app open, a browser with web push + service workers, and permission granted. Whether the recipient must be a signed-in Catalyst user is "not explicitly stated" on the page — but addressing by user account email strongly implies Catalyst Authentication identity (INFERRED).
- Server send (VERIFIED, [send-notifications](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/push-notifications/send-notifications/)): `app.pushNotification().web().sendNotification(message, userList)` — message "plain text, HTML, or a JSON object to be parsed"; userList "user IDs or email addresses; maximum of 50 users per call". Local `web-notification.d.ts`: `sendNotification(message: string, recipients: Array<string>): Promise<boolean>`. Mobile: `mobile()` with `sendAndroidNotification` / `sendIOSNotification` (local); iOS needs an APNs certificate, Android uses FCM ([intro](https://docs.catalyst.zoho.com/en/cloud-scale/help/push-notifications/introduction/)).
- Free tier "500 notifications free per month". **DAPPA gap (VERIFIED locally):** `client/src` contains no `enableNotification` call — only the server side (`lib/push.js`) exists, so no browser is ever registered.

### 4.13 Web Client Hosting
"host the client part of the web-based applications"; "one web application for each project"; versioning/rollback from console; the page points larger needs to Slate ([intro](https://docs.catalyst.zoho.com/en/cloud-scale/help/web-client-hosting/introduction/), VERIFIED). Free tier "300,000 requests free per month".

### 4.14 Domain Mappings — full section
"map your own domain to the production URL"; up to 5 domains per app ([intro](https://docs.catalyst.zoho.com/en/cloud-scale/help/domain-mappings/introduction/), VERIFIED). Steps (VERIFIED, [implementation](https://docs.catalyst.zoho.com/en/cloud-scale/help/domain-mappings/implementation/)): CNAME `<sub>` → `catalyst.cs.zohohost.com`; console Add Mapping → hash key → second CNAME `<hash>.<sub>` → `catalyst.cs.zohohost.com` → Verify → email support@zohocatalyst.com for the SSL certificate ("within 48 hours", auto-renewed) → Apply. "Only subdomains supported"; "restricted to production environment only". Console + DNS + support ticket; no SDK.

### 4.15 Mobile Device Management
Host "one Android app and one iOS app for each project", invite users, track installs ([intro](https://docs.catalyst.zoho.com/en/cloud-scale/help/mobile-device-management/introduction/), VERIFIED). Not in IN DC (§ 2).

### 4.16 Event Listeners (legacy) → Signals
"functions as an event bus service, listening for predefined events and automatically triggering the corresponding Event functions or targeted Circuits"; "Catalyst now offers you a brand new event bus service called Signals … a significant upgrade" ([intro](https://docs.catalyst.zoho.com/en/cloud-scale/help/event-listeners/introduction/), VERIFIED). See § 9.

---

## 5. Zia Services (every component)

Common facts: all Zia calls take an `fs.ReadStream`; the instance is `const zia = app.zia()` ([instance page](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/get-component-instance/)); free tier is "ZiaServices: 100 APIs free per month" ([free tier](https://catalyst.zoho.com/free-tier.html), VERIFIED) — one pooled allowance, not per component. Every component can be tested in the console by uploading a sample image (stated on each intro page). The installed 3.4.0 `zia.d.ts` declares exactly: `detectObject extractOpticalCharacters extractAadhaarCharacters scanBarcode moderateImage analyseFace compareFace automl getSentimentAnalysis getKeywordExtraction getNERPrediction getTextAnalytics` (VERIFIED). There is **no translation, speech, or language-detection method** in the SDK or in the Zia docs index — DAPPA's `zia-language` row ("POSTs ZIA_TRANSLATE_URL") has no Catalyst endpoint to point at; the only language-detection Zia feature found is a QuickML pipeline node (§ 6.4).

### 5.1 Identity Scanner — full section
- Two tasks (VERIFIED, [intro](https://docs.catalyst.zoho.com/en/zia-services/help/identity-scanner/introduction/)): E-KYC "Compares two faces in two different images to determine if they are the same individual", and Document Processing (Aadhaar, PAN, cheque, passbook). "Catalyst does not store any of the files you upload … one-time processing only."
- Facial comparison method (VERIFIED, [SDK](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/identity-scanner/facial-comparison/); local `compareFace(sourceImage: fs.ReadStream, queryImage: fs.ReadStream): Promise<ICatalystZiaFaceComparison>`):
  ```js
  const res = await app.zia().compareFace(fs.createReadStream('source.webp'), fs.createReadStream('query.webp'));
  // → { "confidence": 0.9464, "matched": "true" }
  ```
  Input ".webp, .jpeg, .png", "File size limit: 10 MB"; "Comparison succeeds only if confidence score exceeds 0.5"; either image can be source. Response fields: `confidence` (0–1 number) and `matched` (**string** `"true"`/`"false"` — compare as a string). Key concepts: face detection → landmarks → faceprint comparison; "a match result is true only when … above 50% (i.e. 0.5)" ([key concepts](https://docs.catalyst.zoho.com/en/zia-services/help/identity-scanner/key-concepts/), VERIFIED). This is a 1:1 comparison; there is no gallery/1:N search API (INFERRED from the API surface).
- Document processing (VERIFIED): Aadhaar `zia.extractAadhaarCharacters(frontStream, backStream, 'eng,tam')` → `{ text: "<JSON string with address/gender/dob/name/aadhaar each {prob, value}>" }` (note `text` is a JSON *string*) ([Aadhaar](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/identity-scanner/aadhaar/)); PAN `zia.extractOpticalCharacters(stream, { modelType: 'PAN' })` → `{ date_of_birth, last_name, pan, first_name }` ([PAN](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/identity-scanner/pan/)); cheque `{ modelType: 'CHEQUE' }` → `{ date, account_number, amount, branch_name, bank_name, ifsc }` ([cheque](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/identity-scanner/cheque/)); passbook `{ language: 'tam', modelType: 'PASSBOOK' }` → bankName/accountNumber/branch/ifsc/imps/neft/rtgs ([passbook](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/identity-scanner/passbook/)). Formats/limits: Aadhaar 15 MB per side; cheque is "CTS-2010 format only" ([key concepts](https://docs.catalyst.zoho.com/en/zia-services/help/identity-scanner/key-concepts/)).
- DC: document processing **IN only**; console testing of facial comparison IN only (§ 2). No console step for the SDK path.
- Policy note for DAPPA (INFERRED): face comparison on *generated* faces is compatible with CLAUDE.md's "synthetic (generated faces only)"; document processing would require fabricating Aadhaar/PAN images, which is not something to put in a police demo.

### 5.2 Face Analytics — full section
- "performs facial detection in images, and implements advanced computational analysis on the detected faces"; predicts coordinates, smile, age, gender; "Detects up to 10 faces per image" ([intro](https://docs.catalyst.zoho.com/en/zia-services/help/face-analytics/introduction/), VERIFIED). Modes (VERIFIED, [key concepts](https://docs.catalyst.zoho.com/en/zia-services/help/face-analytics/key-concepts/)): basic = "0-point landmark detector … [x1, y1, x2, y2]", moderate = 5-point (eyes, nose tip, lips), advanced = 68-point (jawline, eyebrows, eyes, nose bridge, nostril line, lips); age brackets "0-2, 3-9, 10-19, 20-29, 30-39, 40-49, 50-59, 60-69, more than 70"; emotion = "smiling and not_smiling"; gender = confidence for male/female; jpg/jpeg/png, 10 MB.
- SDK (VERIFIED, [SDK](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/face-analytics/); local `analyseFace(image, opts?: { mode?, emotion?, age?, gender? })`):
  ```js
  await app.zia().analyseFace(fs.createReadStream('./face.png'), { mode: 'moderate', age: true, emotion: true, gender: false });
  ```
  mode `'basic' | 'moderate' | 'advanced'` (advanced default). Response: `faces_count` and `faces[]` each with `co_ordinates`, `emotion`, `age`, `gender`, `landmarks`, `confidence`, `id`.
- **Does not match faces:** none of the intro, key-concepts or SDK pages mention comparison, matching or identification (VERIFIED absence on all three; the SDK page summary explicitly: "does not mention face matching, comparison, or identification"). Matching is exclusively `compareFace` in Identity Scanner.

### 5.3 Object Recognition
"recognizes and identifies objects in an image"; "80 different kinds of common objects", examples "person, car, dog, chair, traffic light, knife, umbrella, cellphone, book, cake, baseball bat, laptop, aeroplane, stop_sign, parking meter" ([intro](https://docs.catalyst.zoho.com/en/zia-services/help/object-recognition/introduction/), [key concepts](https://docs.catalyst.zoho.com/en/zia-services/help/object-recognition/key-concepts/), VERIFIED); the full 80-class list is not enumerated (gap; the examples match COCO classes — INFERRED). Formats webp/jpeg/png, 10 MB. SDK: `await zia.detectObject(fs.createReadStream('./img.webp'))` → `{ objects: [ { co_ordinates: [322,125,708,1201], object_type: "person", confidence: "99.82" } ] }` ([SDK](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/object-recognition/), VERIFIED; confidence is a string 0–100).

### 5.4 Barcode Scanner
14 formats: Code 39/128/93, EAN-8/13, Codabar, ITF, UPC-A/E, RSS, QR, Aztec, PDF417, Data Matrix ([intro](https://docs.catalyst.zoho.com/en/zia-services/help/barcode-scanner/introduction/), VERIFIED); jpg/png, 10 MB, "must not exceed 36000000 pixels" ([key concepts](https://docs.catalyst.zoho.com/en/zia-services/help/barcode-scanner/key-concepts/)). SDK: `zia.scanBarcode(fs.createReadStream('./barcode.png'), { format: 'code39' })` (or `'ALL'`) → `{ content: "..." }` ([SDK](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/barcode-scanner/), VERIFIED).

### 5.5 OCR
"electronic detection of handwritten or printed textual characters"; languages: Indian "English, Hindi, Bengali, Marathi, Telugu, Tamil, Gujarati, Urdu, **Kannada**, Malayalam, Sanskrit", international "Arabic, Chinese, French, Italian, Japanese, Portuguese, Romanian, Spanish"; formats webp/jpeg/png/tiff/bmp/pdf; `modelType` values OCR, AADHAAR, PAN, CHEQUE, PASSBOOK ([key concepts](https://docs.catalyst.zoho.com/en/zia-services/help/optical-character-recognition/key-concepts/), VERIFIED). SDK: `zia.extractOpticalCharacters(stream, { language: 'eng', modelType: 'OCR' })` → `{ confidence: 95, text: "..." }`; max 20 MB; language auto-detected if omitted ([SDK](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/ocr/), VERIFIED). Language *codes* are not listed on the key-concepts page — the Aadhaar page uses `'eng,tam'`, so ISO-639-2 three-letter codes; Kannada would be `'kan'` (INFERRED — verify against the REST reference before hard-coding).

### 5.6 Image Moderation
Categories: explicit nudity, racy, "Bloodshed, gore, and violence", drugs, weapons ([intro](https://docs.catalyst.zoho.com/en/zia-services/help/image-moderation/introduction/), VERIFIED). SDK: `zia.moderateImage(stream, { mode: 'moderate' })` (BASIC/MODERATE/ADVANCED, advanced default) → `{ probability: { racy: "0.09", nudity: "0.06" }, confidence: "0.85", prediction: "safe_to_use" }` ([SDK](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/image-moderation/), VERIFIED).

### 5.7 Text Analytics
Sentiment (Positive/Negative/Neutral, confidences), NER, Keyword extraction ([intro](https://docs.catalyst.zoho.com/en/zia-services/help/text-analytics/introduction/)); NER tags "Organization, Number, Person, Money, Miscellaneous, Country, State, City, Location, Address, Serving, Length, Weight, Email, Phone, Website, Ordinal, Volume, Area, Speed, Temperature, Dataspeed, Datamemory, Color, Colorcode, Language, Date, Time, Duration"; keyword extraction has no confidence ([key concepts](https://docs.catalyst.zoho.com/en/zia-services/help/text-analytics/key-concepts/), VERIFIED). SDK (VERIFIED): `zia.getTextAnalytics(textArray, keywordsArray?)` ([all](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/text-analytics/all-text-analytics/)), `zia.getSentimentAnalysis(textArray, keywordsArray?)` → `sentiment_prediction[{document_sentiment, sentence_analytics[], overall_score}]` ([sentiment](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/text-analytics/sentiment-analysis/)), `zia.getNERPrediction(textArray)` → `ner.general_entities[{start_index,end_index,ner_tag,confidence_score,token}]` ([NER](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/text-analytics/named-entity-recognition/)), `zia.getKeywordExtraction(textArray)` → `keyword_extractor{keywords[],keyphrases[]}` ([keywords](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/text-analytics/keyword-extraction/)). Limit "max 1500 characters per request". Supported languages are not stated (gap; samples are English). DAPPA's `lib/zia.js` names match.

### 5.8 Zia AutoML
`zia.automl(modelId, { column_1: value, ... })` → `{ classification_result: { Dollars: 0, Percentage: 80, ... } }` ([SDK](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/automl/), VERIFIED). AutoML is no longer on the Zia Services index (VERIFIED absence) and is **not available in IN DC** (§ 2). The model is trained in the console (INFERRED). DAPPA's `zia-automl` row is therefore dead in this DC; QuickML's AutoML pipeline (§ 6.3) is the IN-available equivalent.

---

## 6. QuickML — full section

- Nature and access: "a fully no-code ML pipeline builder service"; accessed "from the highly-integrated Catalyst console"; not in CA/JP/SA ([getting started](https://docs.catalyst.zoho.com/en/quickml/getting-started/introduction/), VERIFIED). No support request is needed for pipelines, endpoints, LLM serving, RAG or Knowledge Base (no such sentence on those pages — VERIFIED absence); **Custom Code needs a support request** ([custom code](https://docs.catalyst.zoho.com/en/quickml/help/custom-code/), VERIFIED).
- Free tier (VERIFIED, [free tier](https://catalyst.zoho.com/free-tier.html)): prediction "500 calls free per month", storage 1 GB, training "1800 vCPU seconds, Free Memory = 1800 GB-seconds".

### 6.1 Pipelines and endpoints
Algorithms (VERIFIED, [classification](https://docs.catalyst.zoho.com/en/quickml/help/ml-algorithms/classification-algorithms/)): AdaBoost, CatBoost, Decision Tree, GB, KNN, LGBM, Logistic Regression, Naive Bayes, Random Forest, SVM, XGB. Preprocessing ops: Encoding (ordinal/one-hot/label/target/count…), Feature Engineering, Imputation, Normalization, Transformers ([encoding](https://docs.catalyst.zoho.com/en/quickml/help/operations-in-quickml/encoding/), VERIFIED). Endpoints (VERIFIED, [pipeline endpoints](https://docs.catalyst.zoho.com/en/quickml/help/pipeline-endpoints/)): created from a trained model version; REST needs headers `X-QUICKML-ENDPOINT-KEY`, `Authorization: Zoho-oauthtoken`, `CATALYST-ORG`, `Environment`; scope `QuickML.deployment.READ`. SDK (VERIFIED, [execute endpoints](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/quickml/execute-quickml-endpoints/)): `const result = await app.quickML().predict("{endpoint_key}", input_data)` → `{ status: 'success', result: [...] }`. The SDK page does not mention `CATALYST-ORG`; DAPPA's README notes the SDK needs `X_ZOHO_CATALYST_ORG_ID` to send it — consistent with the REST header list (INFERRED; also recorded in project memory).

### 6.2 Custom Code (early access, support request)
"Custom Data Transformation" (`transform()`), "Custom ML Transformation" (`fit()`/`transform()`), "Custom Algorithm" (`fit()`, `predict()`, `get_evaluation_metrics()`); libraries incl. numpy, scipy, pandas, xgboost, catboost, lightgbm, sklearn, tensorflow, statsmodels, transformers, sentence_transformers, shap, lime, pmdarima ([custom code](https://docs.catalyst.zoho.com/en/quickml/help/custom-code/), VERIFIED).

### 6.3 AutoML pipeline
Create Pipeline → tick "Create an Auto-generated pipeline using AutoML" → best model with metrics ([create AutoML pipeline](https://docs.catalyst.zoho.com/en/quickml/help/create-automl-pipeline/), VERIFIED). Problem types not stated (gap).

### 6.4 Zia features as pipeline nodes
"Zia Sentiment Analysis, Zia Keyword extraction, Zia Language detection, Zia Emotion detection, Zia Intent Extraction, Zia Activity Extraction, Zia Commitment Classification" ([zia features](https://docs.catalyst.zoho.com/en/quickml/help/zia-features/), VERIFIED) — the only place a Catalyst language-detection capability appears.

### 6.5 LLM Serving
Models on the help page: "Qwen 2.5 - 14B Instruct", "Qwen 2.5 - 7B Coder", "Qwen 2.5 - 7B Vision Language"; flow: QuickML → Generative AI → LLM Serving → pick model → query; endpoint URL under Model Details → API Details; OAuth auth; max output "between 1 and 4096" tokens; US/IN/EU ([LLM serving](https://docs.catalyst.zoho.com/en/quickml/help/generative-ai/llm-serving/), VERIFIED). August 2026 release notes (VERIFIED, [QuickML release notes](https://docs.catalyst.zoho.com/en/release-notes/all/?service=quickml)): "GLM 4.7 Flash, a 30B-A3B Mixture-of-Experts" added; Qwen 2.5-7B Vision upgraded to "Qwen 3.6-35B-A3B"; "LLM serving now supports tool calling, allowing models to invoke external functions and APIs during a conversation"; Qwen 2.5-7B Coder, Qwen MoE and Qwen 2.5-14B Instruct deprecated with migration to GLM 4.7 Flash recommended "before July 2026". So the help page's model list is stale relative to the release notes (VERIFIED discrepancy).

### 6.6 RAG and Knowledge Base
RAG: KB from ".pdf, .docx, and .txt files, with a size limit of 500KB per file" (also WorkDrive and Zoho Learn); embeddings + re-ranking; "Qwen 2.5 14B Instruct" generator on the help page; endpoint via "View API" → API Details; POST with OAuth; "Chat history is not supported"; US/IN/EU ([RAG](https://docs.catalyst.zoho.com/en/quickml/help/generative-ai/rag/), [KB](https://docs.catalyst.zoho.com/en/quickml/help/generative-ai/knowledge-base/), VERIFIED). Release notes add "RAG task modes: Document Search, Response Generation, Agentic RAG" and "You can now deploy both LLM serving and RAG parameter configurations as callable Generative AI endpoints" with "dedicated REST APIs and SDK information" (VERIFIED). No `zcatalyst-sdk-node` method for LLM/RAG exists in 3.4.0 (`quick-ml` module has only `predict` — VERIFIED locally); DAPPA's `QUICKML_LLM_URL` POST approach is the right shape.

---

## 7. SmartBrowz
- PDF & Screenshot: inputs HTML, URL, Templates; outputs .webp/.png/.pdf; password-protected docs; SDK/API/Playground ([intro](https://docs.catalyst.zoho.com/en/smartbrowz/help/pdfnscreenshot/introduction/), VERIFIED). SDK (VERIFIED, [generate-pdfnscreenshot](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/smartbrowz/generate-pdfnscreenshot/)): `convertToPdf(source, options)`, `takeScreenshot(source, options)`, `generateFromTemplate(templateId, data)`; options `pdf_options { format, landscape, scale, password, display_header_footer, header_template, footer_template, margin, page_ranges, height, width }`, `page_options { css, javascript_enabled, viewport, device }`, `navigation_options { timeout, wait_until }`, `output_options { output_type }`, `template_data`. Return type not stated (gap; DAPPA already writes the result to Stratus, so it is a buffer/stream in practice — INFERRED from working code). Local 3.4.0 `smartbrowz` module: `convertToPdf takeScreenshot generateFromTemplate dataverse getEnrichedLead findTechStack getSimilarCompanies browserGrid getGrid getGridNodes stopGrid` (VERIFIED). Free tier "50 PDFs free per month", Headless "5 hours".
- Templates: console → CONVERT → Templates → pre-configured or Custom ([create templates](https://docs.catalyst.zoho.com/en/smartbrowz/help/templates/create-templates/), VERIFIED); placeholder syntax not on the page (gap).
- Headless / Browser Grid: multiple headless browsers in parallel; queue wait "30 seconds" (Selenium) or "5 minutes" (Puppeteer/Playwright) ([browser grid](https://docs.catalyst.zoho.com/en/smartbrowz/help/browser-grid/introduction/), VERIFIED); Node SDK 3.3.0 added grid support ([release notes](https://docs.catalyst.zoho.com/en/release-notes/all/)).
- Browser Logic: a function type (Java/Node) with invocation URL `…/server/{function_name}/execute` ([intro](https://docs.catalyst.zoho.com/en/smartbrowz/help/browser-logic/introduction/), VERIFIED).
- Dataverse (beta): lead enrichment, tech stack, similar companies; "500 calls per month"; **US DC only** ([intro](https://docs.catalyst.zoho.com/en/smartbrowz/help/dataverse/introduction/), VERIFIED). Irrelevant to DAPPA.

## 8. ConvoKraft
"build conversational bots that can be configured to comprehend users message, its intent and respond back conversationally in English"; Bots, Actions, Handlers, Bot Operations; backend via "Catalyst Integration Functions or Deluge" or Webhooks ([index](https://docs.catalyst.zoho.com/en/convokraft/), VERIFIED). Embedding (VERIFIED, [JS SDK](https://docs.catalyst.zoho.com/en/convokraft/sdk/js/overview)): `<script src="https://console.catalyst.zoho.com/convokraft/assets/js/convokraft-chat-sdk.js">` after a `<convokraft-chat-bot bot-name="…" project-id="…" org-id="…">` element inside a fixed-position container; bot must be published. Pricing: "Catalyst currently provides the ConvoKraft service for completely free of cost" ([billing](https://docs.catalyst.zoho.com/en/deployment-and-billing/billing/introduction/), VERIFIED); free tier "1000 messages free per month". DC: no restriction sentence found on the pages read. **Caveat for IN:** Integration Functions are unavailable in IN (§ 2), so bot actions would have to be Deluge or a webhook to a DAPPA Advanced I/O route (INFERRED). Console-built; no server SDK.

## 9. Signals
"Event Bus service"; publishers = Zoho, Catalyst (same project) and Custom; targets = Functions, Circuits, Webhooks; "only one event to a rule", "maximum: 5" targets ([index](https://docs.catalyst.zoho.com/en/signals/), [publishers](https://docs.catalyst.zoho.com/en/signals/help/publishers/key-aspects/), VERIFIED). Delivery (VERIFIED, [targets](https://docs.catalyst.zoho.com/en/signals/help/targets/key-aspects)): timeouts webhooks/circuits 5 s (queue) / 15 s (batch), functions 15 min; Instant vs Batch (24 h TTL); "up to 20 retry attempts", auto backoff 1→10 min. Custom events are published by REST with an API key configured in the publisher; schema auto-generated from a sample payload (live URL valid 15 minutes) ([events](https://docs.catalyst.zoho.com/en/signals/help/events/), VERIFIED); event size "100 KB for individual Zoho events, 5 MB for arrays" ([FAQ](https://docs.catalyst.zoho.com/en/faq/signals/), VERIFIED). No Node SDK publish method (not in the v2 nav or the 3.4.0 module list — VERIFIED absence). DC availability not stated (gap). DAPPA's `signals-cross-app` row correctly calls the extra subscription a console step.

## 10. Job Scheduling
Jobs run in a Job Pool and trigger "Job Functions, Webhooks, Circuits, or AppSail services"; crons "Pre-defined or Dynamic"; minimum spacing "within one minute of each other"; "no restrictions on the number of jobs" ([index](https://docs.catalyst.zoho.com/en/job-scheduling/), [jobs](https://docs.catalyst.zoho.com/en/job-scheduling/help/job/introduction/), VERIFIED). The legacy Cron page calls it "Early Access mode" ([cron intro](https://docs.catalyst.zoho.com/en/cloud-scale/help/cron/introduction/)) while its own pages carry no early-access note (VERIFIED discrepancy). SDK (VERIFIED, [create-job](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/job-scheduling/jobs/create-job/)):
```js
await app.jobScheduling().JOB.submitJob({ job_name, jobpool_name, target_type: 'Function', target_name, params: {...}, job_config: { number_of_retries: 2, retry_interval: 900 } });
// target_type 'Webhook' adds request_method, url, headers, request_body; 'AppSail' adds target_name + url path; 'Circuit' uses test_cases
```
Local 3.4.0 module: `submitJob getJob deleteJob getAllJobpool getJobpool createCron getCron getAllCron updateCron pauseCron resumeCron runCron deleteCron` (VERIFIED). Console: job pools are created in the console ([create jobpool](https://docs.catalyst.zoho.com/en/job-scheduling/help/implementation/create-jobpool/)).

## 11. Slate
Frameworks "Next.js, React, Angular, Astro, Vue, SolidJS, Svelte, and Vite"; custom domains, auto SSL, previews, rollback, env vars, caching ([index](https://docs.catalyst.zoho.com/en/slate/), VERIFIED). CLI (VERIFIED, [deploy from CLI](https://docs.catalyst.zoho.com/en/slate/help/deploy-from-cli)): `catalyst init slate`, `catalyst slate:create --name <n> --framework <f>`, `catalyst slate:link`, `catalyst serve --only slate`, `catalyst deploy slate`, `catalyst deploy slate --production`; Vite dev command `npm run dev -- --port $ZC_SLATE_PORT` in `cli-config.json`. Note DAPPA's `servicemap.js` names the row "Slate / Web Client Hosting" but the client is deployed as the classic web client; they are distinct products (VERIFIED from both index pages).

## 12. Pipelines
YAML file "mandatorily … catalyst-pipelines.yaml"; runners, images, variables, conditions, steps, jobs, stages ([index](https://docs.catalyst.zoho.com/en/pipelines/), VERIFIED). Git providers "GitHub, GitLab or Bitbucket" ([getting started](https://docs.catalyst.zoho.com/en/pipelines/getting-started/introduction/)). Triggers: automatic "everytime a push or merge event occurs" in the linked repo, or manual "Execute Pipeline" with optional JSON event ([triggers](https://docs.catalyst.zoho.com/en/pipelines/help/triggers/introduction/), VERIFIED); no tag/schedule triggers documented. SDK: `app.pipeline()`, `getPipelineDetails(id)`, `runPipeline(id, config?)` ([SDK](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/pipelines/get-pipeline-instance/)); local module `getPipelineDetails runPipeline` (VERIFIED). GitHub Integration (DevOps) is the older component, "available to Catalyst users who were active before July 2024"; Pipelines is "in early access" per that page ([GitHub integration](https://docs.catalyst.zoho.com/en/devops/help/github-integration/introduction/), VERIFIED).

## 13. DevOps
- **Logs**: Access logs (Basic/Advanced I/O, Integration, Browser Logic) and Application logs (all types); retention "seven days" dev, "fourteen days" prod; manual push with severity ([intro](https://docs.catalyst.zoho.com/en/devops/help/logs/introduction/), VERIFIED).
- **APM**: per-function execution insights and "component calls made by the functions"; enable/disable page; not in CA ([intro](https://docs.catalyst.zoho.com/en/devops/help/apm/introduction/)); free tier 5,000 requests. The 3.4.0 package vendors `lib/apminsight` (Site24x7 agent README, VERIFIED locally) — INFERRED to be the APM agent.
- **Metrics**: Data Store, Cache, Cron, Stratus, API usage charts ([intro](https://docs.catalyst.zoho.com/en/devops/help/metrics/introduction/), VERIFIED).
- **Application Alerts**: email alerts for Cron, Event Listener and Logs; "up to 5 … in the developer environment, and up to 20 … in the production environment" ([intro](https://docs.catalyst.zoho.com/en/devops/help/application-alerts/introduction/), VERIFIED).
- **Automation Testing**: API test cases/suites/plans on function endpoints; not in IN (§ 2).
- **GitHub Integration**: see § 12.

## 14. AI Toolkit
- **Context for LLMs**: `https://docs.catalyst.zoho.com/en/llms-full.txt`; `/index.md` on any page ([page](https://docs.catalyst.zoho.com/en/ai-toolkit/context-serve/), VERIFIED).
- **Catalyst MCP Server**: "100+ MCP tools"; dynamic server `https://catalyst.zohomcp.com/mcp/message`; custom server `https://<name>-<id>.zohomcp.com/mcp/<APIKEY>/message` ([overview](https://docs.catalyst.zoho.com/en/ai-toolkit/catalyst-mcp-server/overview/), VERIFIED).
- **Catalyst AI Plugin**: "power your AI models like Claude.ai, Codex into a Catalyst-aware coding agent"; MCP server + "curated skill file set" ([overview](https://docs.catalyst.zoho.com/en/ai-toolkit/catalyst-plugin/overview/), VERIFIED).
These are developer tooling, not runtime services; they do not count as features.

## 15. Environments, production migration, billing
- Development is "a local sandbox"; production "the live mode"; billing starts on production API calls; dev cap "upto 200k API calls for a single application" ([environments intro](https://docs.catalyst.zoho.com/en/deployment-and-billing/environments/introduction/), [development](https://docs.catalyst.zoho.com/en/deployment-and-billing/environments/development-environment/), VERIFIED).
- **What moves:** "When you are deploying your application for the first time … you can only deploy it from the development to the production environment"; later "from development to production, or from production to development" ([deployment types](https://docs.catalyst.zoho.com/en/deployment-and-billing/environments/deployment-types/), VERIFIED); "Only the features and data that were migrated to production in the last deployment will be displayed"; "Any changes made in the development environment after the last deployment will not be available in production until they are deployed again" ([production](https://docs.catalyst.zoho.com/en/deployment-and-billing/environments/production-environment/), VERIFIED). **The pages do not itemise which components carry over** (functions, client, schemas vs rows, Stratus objects, env vars, crons, users) — a real gap; the phrase "features and data" suggests rows can be selected, but that is INFERRED. `scripts/bulk_load.js --production` (CLAUDE.md) already assumes rows must be re-loaded, which is the safe reading. Production URLs: web `https://<project_domain>.catalystserverless.com`, Advanced I/O `…/server/<function_name>/`.
- Billing: pay-as-you-go with a monthly-resetting free tier, or subscription; "one-time, USD 250 worth of free resources" for first-time users ([billing](https://docs.catalyst.zoho.com/en/deployment-and-billing/billing/introduction/), VERIFIED); quotas on [free-tier.html](https://catalyst.zoho.com/free-tier.html) (quoted per service above).

## 16. Undocumented modules in the installed SDK 3.4.0 (do not build on these)
VERIFIED from `node_modules/zcatalyst-sdk-node/lib/`: `queue` (`Queue.getAllTopics() getTopicDetails(id) topic(id)`; `Topic.produce(value) consumer()`), `gql` (`GQL.executeGQL(gql)`), `connector`, `apminsight`. None has a docs page in the v2 reference nav, `executeGQL` returns nothing on the docs domain, and the only "queue" hits are the legacy Event Listeners "Queued Events" page ([queued events](https://docs.catalyst.zoho.com/en/cloud-scale/help/event-listeners/queued-events/)) — a different thing. The modular `@zcatalyst/*` repo ([zcatalyst-sdk-js](https://github.com/catalystbyzoho/zcatalyst-sdk-js)) lists auth, cache, circuit, connections, connector, datastore, functions, job-scheduling, mail, nosql, pipelines, push-notification, quick-ml, smartbrowz, stratus, zia — no queue or gql (VERIFIED). Status: INFERRED to be unreleased/preview surface; a judge cannot check it against docs, so it fails the "every claim checkable" rule.

---

## 17. Comparison with `functions/dappa_api/lib/servicemap.js` (28 rows)

| # | servicemap row | Verdict from the docs |
|---|---|---|
| 1 | serverless-functions | Correct. 30 s Advanced I/O timeout is the binding limit for every live AI call (`AI_TIMEOUT_MS` 4000 is well inside it). |
| 2 | event-functions | Correct; Signals is the current name of the bus (§ 9). |
| 3 | cron-job-scheduling | Correct as legacy Cron; Job Scheduling is the successor (§ 10). |
| 4–5 | appsail-managed / appsail-oci | Correct as "not used". |
| 6 | signals-cross-app | Correct (console rule). |
| 7 | data-store | Correct; 300-row page matches the documented cap. |
| 8 | data-store-search | Correct mechanism; note Text columns cannot be indexed (§ 4.2) — pick Var Char columns. |
| 9 | nosql | Correct; item format matches docs. |
| 10 | stratus | Correct; `generatePreSignedUrl(key, 'GET', {expiryIn})` matches. |
| 11 | file-store | Works but the docs steer to Stratus (§ 4.5); consider dropping to avoid a legacy row. |
| 12 | cache | Correct; expiry unit is hours (check `lib/cache.js` passes hours, not seconds — not verified here). |
| 13 | mail | Correct call shape; **`MAIL_FROM` cannot be a Gmail/Yahoo address** — needs a domain with SPF/DKIM (§ 4.11). |
| 14 | push-notifications | Server side correct; **client never calls `catalyst.notification.enableNotification()`** so no recipient exists (§ 4.12). |
| 15 | circuits | Call shape correct; **service unavailable in IN DC** — reclassify (§ 2). |
| 16 | zia-text-analytics | Correct. |
| 17 | zia-ocr | Correct; Kannada supported. |
| 18 | zia-language | **No Catalyst translation/speech service exists** in Zia docs or SDK; only QuickML's language-detection node (§ 6.4). Row cannot be satisfied by any console step; reclassify or remove. |
| 19 | zia-automl | Call shape correct; **unavailable in IN DC** — reclassify (§ 2). |
| 20 | quickml-pipelines | Correct; endpoint auth headers documented (§ 6.1). |
| 21 | quickml-llm-rag | Correct approach (no SDK method exists); Gen-AI endpoints now deployable (§ 6.6). |
| 22 | smartbrowz | Correct. |
| 23 | authentication | Correct; `role_details.role_name` is the documented role field. |
| 24 | connections | Correct (Node SDK ≥ 3.2.0). |
| 25 | web-client-hosting | Correct, but "Slate /" in the name is inaccurate — Slate is a separate product (§ 11). |
| 26 | api-gateway | Platform row is fair; the gateway itself is "an optional, paid component" (§ 4.8). |
| 27 | domain-mappings | Correct; production-only + support ticket for SSL. |
| 28 | pipelines | Correct; `app.pipeline().runPipeline(id)` exists if ever wanted. |

Not in servicemap at all: OLAP database, Job Scheduling, Slate, Security Rules, Logs/APM/Metrics/Alerts, Image Moderation, Object Recognition, Barcode, Face Analytics, Identity Scanner, ConvoKraft, MDM, Automation Testing, AI Toolkit.

---

## 18. Services DAPPA could still add — ranked by demo value for a police analytics platform

Ranking criteria: analytic or visual substance the challenge scores (C1–C6), IN-DC availability, no support request, and an SDK call a judge can grep. Each item names the exact call.

1. **Data Store OLAP database for the trends/KPI aggregates (C1, C4).** Enable once in the console (Data Store → OLAP Database → Enable), then route the heavy `GROUP BY` queries in `lib/datastore.js` through `app.zcql().executeOLAPQuery(sql)` (3.4.0 `.d.ts`; docs page missing — cite the intro + enable page and the typing). Substance: real analytical engine behind the charts instead of paged 300-row scans; the same ZCQL runs on both, so the fallback is `executeZCQLQuery`. Risk: the SDK page is 404 — verify the call once in `catalyst serve` before claiming it.
2. **Zia Identity Scanner `compareFace` — "is this the same person?" on synthetic offender photos (C2, C5, C6).** `app.zia().compareFace(fs.createReadStream(a), fs.createReadStream(b))` → `{ confidence, matched }`. Use it to confirm/deny an identity-resolution link in Offender 360 (two generated faces from the pipeline, threshold 0.5 documented). 1:1 only, so drive it from the fuzzy-name candidates, not as a gallery search. Ethics: generated faces only; show the confidence, never a "match" badge alone.
3. **Zia Object Recognition on evidence images (C6).** `app.zia().detectObject(stream)` → `objects[{object_type, co_ordinates, confidence}]`; the documented classes include knife, car, person, cellphone, baseball bat — tag synthetic scene photos on the case detail page with bounding boxes. 10 MB, webp/jpeg/png.
4. **QuickML Generative-AI endpoints with RAG task modes and tool calling (C6).** Deploy the copilot's RAG configuration as an endpoint (Aug 2026 release), use "Document Search" mode to return the FIR chunks that support an answer and "Agentic RAG" for multi-step questions; tool calling can bind the copilot to `/trends/*` routes. Still a POST to `QUICKML_LLM_URL`; no SDK. Console-built, IN-available, no support request.
5. **Web push registration in the client (C1 alerting).** Add `catalyst.notification.enableNotification()` + `messageHandler` from the console snippet so `pushNotification().web().sendNotification(msg, [emails])` reaches a browser; recipients are email IDs (≤50/call). Converts an existing "active" row into something visible on stage.
6. **SmartBrowz `takeScreenshot` + `generateFromTemplate` for the Weekly Brief (C1 delivery).** `app.smartbrowz().takeScreenshot(mapUrl, { page_options: { viewport }, output_options: { output_type: 'png' } })` to embed the hotspot map; `generateFromTemplate(templateId, template_data)` for a console-designed brief template. Same free tier as the PDF row.
7. **Zia Image Moderation as an evidence-intake guard (C6, small).** `app.zia().moderateImage(stream, { mode: 'advanced' })` → weapons/violence probabilities; flag uploads before an analyst sees them. Modest substance; cheap to wire.
8. **Job Scheduling instead of legacy Cron (C4 freshness).** `app.jobScheduling().JOB.submitJob({ target_type: 'Function', target_name: 'dappa_nightly', ... , job_config: { number_of_retries: 2, retry_interval: 900 } })` from `/admin/circuit/nightly-refresh`, giving retries and a console dashboard. Replaces the unreachable Circuits path in this DC. Needs a console job pool.
9. **Zia Face Analytics on generated suspect photos (C5, cautious).** `app.zia().analyseFace(stream, { mode: 'moderate', age: true, gender: true, emotion: false })` → age bracket + landmarks for an "estimated age range" field. Low analytic weight and sensitive in a policing context; only worth it if framed as demographic *estimation on synthetic data* with confidences shown.
10. **Zia Barcode Scanner for evidence/FIR QR tags (C1, low).** `app.zia().scanBarcode(stream, { format: 'ALL' })` → `{ content }`. Trivial substance; skip unless a QR-based evidence chain is already in the UI.
11. **Slate for the client (platform, no analytic value).** `catalyst deploy slate --production` with previews/rollback. Only if the hosting story needs a feature; it does not add substance.
12. **Signals custom publisher + webhook (platform).** Console rule with a REST API key; lets an external synthetic feed post events. No SDK; marginal for the demo.

Not recommended: Circuits, Zia AutoML, Integration Functions, Automation Testing (all IN-blocked); Zia document processing (would need fabricated ID documents); Dataverse (US only, unrelated); ConvoKraft (English-only, actions need Deluge/webhooks in IN, duplicates the copilot); the undocumented `queue`/`gql` modules.

---

## 19. Gaps (what could not be verified)
- The exact set of components/data copied on a Development → Production deploy is not itemised on any environments page read.
- Node SDK page for `executeOLAPQuery` is 404; the method is verified only from the 3.4.0 typings and one sentence on the ZCQL execute page.
- Circuit execution status vocabulary beyond `running`/`status_code: 1`; Function memory options and package-size limits; Stratus object/bucket limits; Cache value-size and max expiry; NoSQL table count; Data Store row/table limits; Text Analytics supported languages; OCR language *codes*; the full 80-class object list; SmartBrowz template placeholder syntax and SDK return type; Signals and Job Scheduling DC availability; Slate/Job Scheduling early-access status (docs disagree with each other).
- `https://docs.catalyst.zoho.com/en/api/code-reference/zia-services/identity-scanner/facial-comparison/` served Data Store REST content when fetched (misrouted); the REST shape for facial comparison is therefore not verified — the SDK page is.
- `zia-services/help/introduction/`, `serverless/help/functions/key-concepts/`, `data-store/implementation/`, `circuits/get-circuit-execution-status/`, `web/v4/.../enable-notification/`, `identity-scanner/aadhaar-scanning/`, `identity-scanner/document-processing/`, `stratus/generate-presigned-url/`, `zcql/execute-olap-query/` all returned 404 under the URLs tried.
- Pricing per call beyond the free tier was not read (pricing1.html not fetched).

## Sources
1. https://docs.catalyst.zoho.com/en/
2. https://docs.catalyst.zoho.com/en/serverless/
3. https://docs.catalyst.zoho.com/en/cloud-scale/
4. https://docs.catalyst.zoho.com/en/zia-services/
5. https://docs.catalyst.zoho.com/en/devops/
6. https://docs.catalyst.zoho.com/en/quickml/
7. https://docs.catalyst.zoho.com/en/smartbrowz/
8. https://docs.catalyst.zoho.com/en/sdk/
9. https://docs.catalyst.zoho.com/en/getting-started/catalyst-sdk/
10. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/overview/
11. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/upgrade-sdk/
12. https://docs.catalyst.zoho.com/en/zia-services/help/identity-scanner/introduction/
13. https://docs.catalyst.zoho.com/en/zia-services/help/identity-scanner/key-concepts/
14. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/identity-scanner/facial-comparison/
15. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/identity-scanner/aadhaar/
16. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/identity-scanner/pan/
17. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/identity-scanner/cheque/
18. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/identity-scanner/passbook/
19. https://docs.catalyst.zoho.com/en/zia-services/help/face-analytics/introduction/
20. https://docs.catalyst.zoho.com/en/zia-services/help/face-analytics/key-concepts/
21. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/face-analytics/
22. https://docs.catalyst.zoho.com/en/zia-services/help/object-recognition/introduction/
23. https://docs.catalyst.zoho.com/en/zia-services/help/object-recognition/key-concepts/
24. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/object-recognition/
25. https://docs.catalyst.zoho.com/en/zia-services/help/barcode-scanner/introduction/
26. https://docs.catalyst.zoho.com/en/zia-services/help/barcode-scanner/key-concepts/
27. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/barcode-scanner/
28. https://docs.catalyst.zoho.com/en/zia-services/help/optical-character-recognition/introduction/
29. https://docs.catalyst.zoho.com/en/zia-services/help/optical-character-recognition/key-concepts/
30. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/ocr/
31. https://docs.catalyst.zoho.com/en/zia-services/help/text-analytics/introduction/
32. https://docs.catalyst.zoho.com/en/zia-services/help/text-analytics/key-concepts/
33. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/text-analytics/all-text-analytics/
34. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/text-analytics/sentiment-analysis/
35. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/text-analytics/named-entity-recognition/
36. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/text-analytics/keyword-extraction/
37. https://docs.catalyst.zoho.com/en/zia-services/help/image-moderation/introduction/
38. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/image-moderation/
39. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/automl/
40. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/get-component-instance/
41. https://docs.catalyst.zoho.com/en/serverless/help/circuits/introduction/
42. https://docs.catalyst.zoho.com/en/serverless/help/circuits/key-concepts/
43. https://docs.catalyst.zoho.com/en/serverless/help/circuits/implementation/
44. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/serverless/circuits/get-a-component-instance/
45. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/serverless/circuits/execute-circuit/
46. https://docs.catalyst.zoho.com/en/convokraft/
47. https://docs.catalyst.zoho.com/en/convokraft/help/bots/introduction
48. https://docs.catalyst.zoho.com/en/convokraft/sdk/js/overview
49. https://docs.catalyst.zoho.com/en/signals/
50. https://docs.catalyst.zoho.com/en/signals/help/publishers/key-aspects/
51. https://docs.catalyst.zoho.com/en/signals/help/targets/key-aspects
52. https://docs.catalyst.zoho.com/en/signals/help/events/
53. https://docs.catalyst.zoho.com/en/faq/signals/
54. https://docs.catalyst.zoho.com/en/serverless/help/appsail/introduction/
55. https://docs.catalyst.zoho.com/en/pipelines/
56. https://docs.catalyst.zoho.com/en/pipelines/getting-started/introduction/
57. https://docs.catalyst.zoho.com/en/pipelines/help/triggers/introduction/
58. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/pipelines/get-pipeline-instance/
59. https://docs.catalyst.zoho.com/en/cloud-scale/help/domain-mappings/introduction/
60. https://docs.catalyst.zoho.com/en/cloud-scale/help/domain-mappings/implementation/
61. https://docs.catalyst.zoho.com/en/slate/
62. https://docs.catalyst.zoho.com/en/slate/help/deploy-from-cli
63. https://docs.catalyst.zoho.com/en/job-scheduling/
64. https://docs.catalyst.zoho.com/en/job-scheduling/help/job/introduction/
65. https://docs.catalyst.zoho.com/en/job-scheduling/getting-started/introduction/
66. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/job-scheduling/overview/
67. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/job-scheduling/jobs/create-job/
68. https://docs.catalyst.zoho.com/en/cloud-scale/help/push-notifications/introduction/
69. https://docs.catalyst.zoho.com/en/cloud-scale/help/push-notifications/web/
70. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/push-notifications/get-component-instance/
71. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/push-notifications/send-notifications/
72. https://docs.catalyst.zoho.com/en/cloud-scale/help/mail/introduction/
73. https://docs.catalyst.zoho.com/en/cloud-scale/help/mail/email-configuration/
74. https://docs.catalyst.zoho.com/en/cloud-scale/help/mail/domains/
75. https://docs.catalyst.zoho.com/en/cloud-scale/help/mail/send-emails/
76. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/mail/get-component-instance/
77. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/mail/send-email/
78. https://docs.catalyst.zoho.com/en/cloud-scale/help/search-integration/introduction/
79. https://docs.catalyst.zoho.com/en/cloud-scale/help/search-integration/key-concepts/
80. https://docs.catalyst.zoho.com/en/cloud-scale/help/search-integration/implementation/
81. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/search/get-a-component-instance/
82. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/search/search-data/
83. https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/introduction/
84. https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/columns/
85. https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/tables/
86. https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/olap-database/introduction/
87. https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/olap-database/enable-and-query/
88. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/data-store/get-component-instance/
89. https://docs.catalyst.zoho.com/en/cloud-scale/help/zcql/introduction/
90. https://docs.catalyst.zoho.com/en/cloud-scale/help/zcql/select/
91. https://docs.catalyst.zoho.com/en/cloud-scale/help/zcql/limit/
92. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/zcql/get-component-instance/
93. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/zcql/execute-zcql-query/
94. https://docs.catalyst.zoho.com/en/cloud-scale/help/nosql/introduction/
95. https://docs.catalyst.zoho.com/en/cloud-scale/help/nosql/components/
96. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/nosql/get-component-instance/
97. https://docs.catalyst.zoho.com/en/cloud-scale/help/stratus/introduction/
98. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/stratus/overview/
99. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/stratus/upload-object/
100. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/stratus/download-object/
101. https://docs.catalyst.zoho.com/en/cloud-scale/help/file-store/introduction/
102. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/file-store/get-component-instance/
103. https://docs.catalyst.zoho.com/en/cloud-scale/help/cache/introduction
104. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/cache/get-component-instance/
105. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/cache/insert-data-into-cache/
106. https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/introduction/
107. https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/authentication-types/
108. https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/user-management/introduction/
109. https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/user-management/roles/introduction/
110. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/authentication/get-component-instance/
111. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/authentication/get-user-details/
112. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/authentication/add-new-user/
113. https://docs.catalyst.zoho.com/en/sdk/web/v4/overview/
114. https://docs.catalyst.zoho.com/en/cloud-scale/help/connections/introduction/
115. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/connections/get-connections-instance/
116. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/connections/get-credentials/
117. https://docs.catalyst.zoho.com/en/serverless/help/functions/introduction/
118. https://docs.catalyst.zoho.com/en/serverless/help/functions/advanced-io/
119. https://docs.catalyst.zoho.com/en/serverless/help/functions/job-functions/
120. https://docs.catalyst.zoho.com/en/faq/serverless/
121. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/serverless/functions/get-component-instance/
122. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/serverless/functions/execute-function/
123. https://docs.catalyst.zoho.com/en/serverless/help/security-rules/introduction/
124. https://docs.catalyst.zoho.com/en/cloud-scale/help/cron/introduction/
125. https://docs.catalyst.zoho.com/en/cloud-scale/help/event-listeners/introduction/
126. https://docs.catalyst.zoho.com/en/cloud-scale/help/event-listeners/queued-events/
127. https://docs.catalyst.zoho.com/en/cloud-scale/help/api-gateway/introduction/
128. https://docs.catalyst.zoho.com/en/cloud-scale/help/api-gateway/key-concepts/
129. https://docs.catalyst.zoho.com/en/cloud-scale/help/web-client-hosting/introduction/
130. https://docs.catalyst.zoho.com/en/cloud-scale/help/mobile-device-management/introduction/
131. https://docs.catalyst.zoho.com/en/quickml/getting-started/introduction/
132. https://docs.catalyst.zoho.com/en/quickml/help/pipeline-endpoints/
133. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/quickml/execute-quickml-endpoints/
134. https://docs.catalyst.zoho.com/en/quickml/help/custom-code/
135. https://docs.catalyst.zoho.com/en/quickml/help/create-automl-pipeline/
136. https://docs.catalyst.zoho.com/en/quickml/help/zia-features/
137. https://docs.catalyst.zoho.com/en/quickml/help/ml-algorithms/classification-algorithms/
138. https://docs.catalyst.zoho.com/en/quickml/help/operations-in-quickml/encoding/
139. https://docs.catalyst.zoho.com/en/quickml/help/generative-ai/llm-serving/
140. https://docs.catalyst.zoho.com/en/quickml/help/generative-ai/rag/
141. https://docs.catalyst.zoho.com/en/quickml/help/generative-ai/knowledge-base/
142. https://docs.catalyst.zoho.com/en/release-notes/all/?service=quickml
143. https://docs.catalyst.zoho.com/en/release-notes/all/
144. https://docs.catalyst.zoho.com/en/smartbrowz/getting-started/introduction/
145. https://docs.catalyst.zoho.com/en/smartbrowz/help/pdfnscreenshot/introduction/
146. https://docs.catalyst.zoho.com/en/smartbrowz/help/templates/create-templates/
147. https://docs.catalyst.zoho.com/en/smartbrowz/help/browser-logic/introduction/
148. https://docs.catalyst.zoho.com/en/smartbrowz/help/browser-grid/introduction/
149. https://docs.catalyst.zoho.com/en/smartbrowz/help/dataverse/introduction/
150. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/smartbrowz/create-smartbrowz-instance/
151. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/smartbrowz/generate-pdfnscreenshot/
152. https://docs.catalyst.zoho.com/en/devops/help/logs/introduction/
153. https://docs.catalyst.zoho.com/en/devops/help/apm/introduction/
154. https://docs.catalyst.zoho.com/en/devops/help/metrics/introduction/
155. https://docs.catalyst.zoho.com/en/devops/help/application-alerts/introduction/
156. https://docs.catalyst.zoho.com/en/devops/help/github-integration/introduction/
157. https://docs.catalyst.zoho.com/en/devops/help/automation-testing/introduction/
158. https://docs.catalyst.zoho.com/en/ai-toolkit/context-serve/
159. https://docs.catalyst.zoho.com/en/ai-toolkit/catalyst-mcp-server/overview/
160. https://docs.catalyst.zoho.com/en/ai-toolkit/catalyst-plugin/overview/
161. https://docs.catalyst.zoho.com/en/integrations/openai-integration/introduction/
162. https://docs.catalyst.zoho.com/en/tools/maven-tools/introduction/
163. https://docs.catalyst.zoho.com/en/codelib/introduction/
164. https://docs.catalyst.zoho.com/en/faq/general/
165. https://docs.catalyst.zoho.com/en/deployment-and-billing/environments/introduction/
166. https://docs.catalyst.zoho.com/en/deployment-and-billing/environments/development-environment/
167. https://docs.catalyst.zoho.com/en/deployment-and-billing/environments/deployment-types/
168. https://docs.catalyst.zoho.com/en/deployment-and-billing/environments/production-environment/
169. https://docs.catalyst.zoho.com/en/deployment-and-billing/billing/introduction/
170. https://catalyst.zoho.com/free-tier.html
171. https://registry.npmjs.org/zcatalyst-sdk-node/latest
172. https://github.com/catalystbyzoho/zcatalyst-sdk-js
173. Local: `functions/dappa_api/node_modules/zcatalyst-sdk-node/lib/**/*.d.ts` (3.4.0), `functions/dappa_api/package.json`, `functions/dappa_api/lib/servicemap.js`, `lib/circuits.js`, `lib/push.js`, `.catalystrc`, `README.md`, `docs/ROUND2_BASELINE.md`
