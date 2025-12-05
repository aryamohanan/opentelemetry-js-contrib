/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { diag, trace, context, SpanKind } from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  isWrapped,
} from '@opentelemetry/instrumentation';
import { IORedisInstrumentationConfig } from './types';
import { IORedisCommand, RedisInterface } from './internal-types';
import { ATTR_DB_STATEMENT } from './semconv';
import {
  ATTR_DB_OPERATION_NAME,
  ATTR_DB_QUERY_TEXT,
} from '@opentelemetry/semantic-conventions';
import {
  safeExecuteInTheMiddle,
  SemconvStability,
  semconvStabilityFromStr,
} from '@opentelemetry/instrumentation';
import { endSpan, getClientAttributes } from './utils';
import { defaultDbStatementSerializer } from '@opentelemetry/redis-common';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';

const DEFAULT_CONFIG: IORedisInstrumentationConfig = {
  requireParentSpan: true,
};

export class IORedisInstrumentation extends InstrumentationBase<IORedisInstrumentationConfig> {
  private _semconvStability: SemconvStability;

  constructor(config: IORedisInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, { ...DEFAULT_CONFIG, ...config });
    this._semconvStability = semconvStabilityFromStr(
      'database',
      process.env.OTEL_SEMCONV_STABILITY_OPT_IN
    );
  }

  override setConfig(config: IORedisInstrumentationConfig = {}) {
    super.setConfig({ ...DEFAULT_CONFIG, ...config });

    this._semconvStability = semconvStabilityFromStr(
      'database',
      process.env.OTEL_SEMCONV_STABILITY_OPT_IN
    );
  }

  init(): InstrumentationNodeModuleDefinition[] {
    return [
      new InstrumentationNodeModuleDefinition(
        'ioredis',
        ['>=2.0.0 <6'],
        (module, moduleVersion?: string) => {
          const moduleExports =
            module[Symbol.toStringTag] === 'Module'
              ? module.default // ESM
              : module; // CommonJS
          if (isWrapped(moduleExports.prototype.sendCommand)) {
            this._unwrap(moduleExports.prototype, 'sendCommand');
          }
          this._wrap(
            moduleExports.prototype,
            'sendCommand',
            this._patchSendCommand(moduleVersion)
          );
          if (isWrapped(moduleExports.prototype.connect)) {
            this._unwrap(moduleExports.prototype, 'connect');
          }
          this._wrap(
            moduleExports.prototype,
            'connect',
            this._patchConnection()
          );
          return module;
        },
        module => {
          if (module === undefined) return;
          const moduleExports =
            module[Symbol.toStringTag] === 'Module'
              ? module.default // ESM
              : module; // CommonJS
          this._unwrap(moduleExports.prototype, 'sendCommand');
          this._unwrap(moduleExports.prototype, 'connect');
        }
      ),
    ];
  }

  /**
   * Patch send command internal to trace requests
   */
  private _patchSendCommand(moduleVersion?: string) {
    return (original: Function) => {
      return this._traceSendCommand(original, moduleVersion);
    };
  }

  private _patchConnection() {
    return (original: Function) => {
      return this._traceConnection(original);
    };
  }

  private _traceSendCommand(original: Function, moduleVersion?: string) {
    const instrumentation = this;
    return function (this: RedisInterface, cmd?: IORedisCommand) {
      if (arguments.length < 1 || typeof cmd !== 'object') {
        return original.apply(this, arguments);
      }
      const config = instrumentation.getConfig();
      const dbStatementSerializer =
        config.dbStatementSerializer || defaultDbStatementSerializer;

      const hasNoParentSpan = trace.getSpan(context.active()) === undefined;
      if (config.requireParentSpan === true && hasNoParentSpan) {
        return original.apply(this, arguments);
      }

      const operationName = cmd.name;

      const { host, port } = this.options;

      const attributes = getClientAttributes(
        host,
        port,
        instrumentation._semconvStability
      );

      if (instrumentation._semconvStability & SemconvStability.STABLE) {
        attributes[ATTR_DB_OPERATION_NAME] = operationName;
      }

      const dbStatement = dbStatementSerializer(cmd.name, cmd.args);
      if (dbStatement != null) {
        if (instrumentation._semconvStability & SemconvStability.OLD) {
          attributes[ATTR_DB_STATEMENT] = dbStatement;
        }
        if (instrumentation._semconvStability & SemconvStability.STABLE) {
          attributes[ATTR_DB_QUERY_TEXT] = dbStatement;
        }
      }

      const span = instrumentation.tracer.startSpan(cmd.name, {
        kind: SpanKind.CLIENT,
        attributes,
      });

      const { requestHook } = config;
      if (requestHook) {
        safeExecuteInTheMiddle(
          () =>
            requestHook(span, {
              moduleVersion,
              cmdName: cmd.name,
              cmdArgs: cmd.args,
            }),
          e => {
            if (e) {
              diag.error('ioredis instrumentation: request hook failed', e);
            }
          },
          true
        );
      }

      try {
        const result = original.apply(this, arguments);

        const origResolve = cmd.resolve;
        /* eslint-disable @typescript-eslint/no-explicit-any */
        cmd.resolve = function (result: any) {
          safeExecuteInTheMiddle(
            () => config.responseHook?.(span, cmd.name, cmd.args, result),
            e => {
              if (e) {
                diag.error('ioredis instrumentation: response hook failed', e);
              }
            },
            true
          );

          endSpan(span, null);
          origResolve(result);
        };

        const origReject = cmd.reject;
        cmd.reject = function (err: Error) {
          endSpan(span, err);
          origReject(err);
        };

        return result;
      } catch (error: any) {
        endSpan(span, error);
        throw error;
      }
    };
  }

  private _traceConnection(original: Function) {
    const instrumentation = this;
    return function (this: RedisInterface) {
      const hasNoParentSpan = trace.getSpan(context.active()) === undefined;
      if (
        instrumentation.getConfig().requireParentSpan === true &&
        hasNoParentSpan
      ) {
        return original.apply(this, arguments);
      }

      const { host, port } = this.options;
      const attributes = getClientAttributes(
        host,
        port,
        instrumentation._semconvStability
      );

      if (instrumentation._semconvStability & SemconvStability.OLD) {
        attributes[ATTR_DB_STATEMENT] = 'connect';
      }
      if (instrumentation._semconvStability & SemconvStability.STABLE) {
        attributes[ATTR_DB_QUERY_TEXT] = 'connect';
      }

      const span = instrumentation.tracer.startSpan('connect', {
        kind: SpanKind.CLIENT,
        attributes,
      });

      try {
        const client = original.apply(this, arguments);
        endSpan(span, null);
        return client;
      } catch (error: any) {
        endSpan(span, error);
        throw error;
      }
    };
  }
}
