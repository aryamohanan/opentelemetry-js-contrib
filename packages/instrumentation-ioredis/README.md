# OpenTelemetry ioredis Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for the [`ioredis`](https://github.com/luin/ioredis) module, which may be loaded using the [`@opentelemetry/sdk-trace-node`](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-sdk-trace-node) package and is included in the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle.

If total installation size is not constrained, it is recommended to use the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle with [@opentelemetry/sdk-node](`https://www.npmjs.com/package/@opentelemetry/sdk-node`) for the most seamless instrumentation experience.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```sh
npm install --save @opentelemetry/instrumentation-ioredis
```

### Supported Versions

- [`ioredis`](https://www.npmjs.com/package/ioredis) versions `>=2.0.0 <6`

## Usage

To load a specific instrumentation (**ioredis** in this case), specify it in the registerInstrumentations's configuration

```javascript
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const {
  IORedisInstrumentation,
} = require('@opentelemetry/instrumentation-ioredis');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const provider = new NodeTracerProvider();
provider.register();

registerInstrumentations({
  instrumentations: [
    new IORedisInstrumentation({
      // see under for available configuration
    }),
  ],
});
```

### IORedis Instrumentation Options

IORedis instrumentation has few options available to choose from. You can set the following:

| Options                 | Type                                              | Description                                                                                                       |
| ----------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `dbStatementSerializer` | `DbStatementSerializer`                           | IORedis instrumentation will serialize db.statement using the specified function.                                 |
| `requestHook`           | `RedisRequestCustomAttributeFunction` (function)  | Function for adding custom attributes on db request. Receives params: `span, { moduleVersion, cmdName, cmdArgs }` |
| `responseHook`          | `RedisResponseCustomAttributeFunction` (function) | Function for adding custom attributes on db response                                                              |
| `requireParentSpan`     | `boolean`                                         | Require parent to create ioredis span, default when unset is true                                                 |

#### Custom db.statement Serializer

The instrumentation serializes the command into a Span attribute called `db.statement`. The standard serialization format attempts to be as informative
as possible while avoiding the export of potentially sensitive data. The number of serialized arguments depends on the specific command, see the configuration
list in `@opentelemetry/redis-common`.

It is also possible to define a custom serialization function. The function will receive the command name and arguments and must return a string.

Here is a simple example to serialize the command name skipping arguments:

```javascript
const { IORedisInstrumentation } = require('@opentelemetry/instrumentation-ioredis');

const ioredisInstrumentation = new IORedisInstrumentation({
  dbStatementSerializer: function (cmdName, cmdArgs) {
    return cmdName;
  },
});
```

#### Using `requestHook`

Instrumentation user can configure a custom "hook" function which will be called on every request with the relevant span and request information. User can then set custom attributes on the span or run any instrumentation-extension logic per request.

Here is a simple example that adds a span attribute of `ioredis` instrumented version on each request:

```javascript
const { IORedisInstrumentation } = require('@opentelemetry/instrumentation-ioredis');

const ioredisInstrumentation = new IORedisInstrumentation({
requestHook: function (
    span: Span,
    requestInfo: IORedisRequestHookInformation
  ) {
    if (requestInfo.moduleVersion) {
      span.setAttribute(
        'instrumented_library.version',
        requestInfo.moduleVersion
      );
    }
  }
});

```

## Semantic Conventions

Database semantic conventions (semconv) were stabilized in v1.34.0, and a [migration process](https://github.com/open-telemetry/semantic-conventions/blob/main/docs/non-normative/db-migration.md) was defined.

The latest `@opentelemetry/instrumentation-ioredis` include support for migrating to stable Database semantic conventions, as described below.
The intent is to provide an approximate 6 month time window for users of this instrumentation to migrate to the new Database semconv, after which a new minor version will use the new semconv by default and drop support for the old semconv.

To select which semconv version(s) is emitted from this instrumentation, use the `OTEL_SEMCONV_STABILITY_OPT_IN` environment variable.

- `database`: emit the new (stable) v1.34.0+ semantics
- `database/dup`: emit **both** the old v1.27.0 and the new (stable) v1.34.0+ semantics
- By default, if `OTEL_SEMCONV_STABILITY_OPT_IN` includes neither of the above tokens, the old v1.27.0 semconv is used.

### Attributes collected

| v1.27.0 semconv         | v1.34.0 semconv                                 | Short Description                                                                          |
| ----------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `db.connection_string`  | Removed                                         | String used to connect to the database                                                     |
| `db.user`               | Removed                                         | User used to connect to the database                                                       |
| `db.name`               | Removed, integrated into the new `db.namespace` | The name of the database.                                                                  |
| (not included)          | `db.namespace`                                  | The name of the database, fully qualified within the server address and port.              |
| `db.statement`          | `db.query.text`                                 | The database query being executed.                                                         |
| `db.system`             | `db.system.name`                                | The database management system (DBMS) product as identified by the client instrumentation. |
| `net.peer.port`         | `server.port`                                   | Remote port number.                                                                        |
| `net.peer.name`         | `server.address`                                | Remote hostname or similar.                                                                |
| (not included)          | `db.operation.name`                             | The name of the operation being executed.                                                  |

### Upgrading Semantic Conventions

When upgrading to the new semantic conventions, it is recommended to do so in the following order:

1. Upgrade `@opentelemetry/opentelemetry-instrumentation-ioredis` to the latest version
2. Set `OTEL_SEMCONV_STABILITY_OPT_IN=database/dup` to emit both old and new semantic conventions
3. Modify alerts, dashboards, metrics, and other processes to expect the new semantic conventions
4. Set `OTEL_SEMCONV_STABILITY_OPT_IN=database` to emit only the new semantic conventions

This will cause both the old and new semantic conventions to be emitted during the transition period.

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-ioredis
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-ioredis.svg
