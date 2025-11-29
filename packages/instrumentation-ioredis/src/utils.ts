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

import { Attributes, Span, SpanStatusCode } from '@opentelemetry/api';
import { SemconvStability } from '@opentelemetry/instrumentation';
import {
  ATTR_DB_SYSTEM_NAME,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import {
  ATTR_DB_CONNECTION_STRING,
  ATTR_DB_SYSTEM,
  ATTR_NET_PEER_NAME,
  ATTR_NET_PEER_PORT,
  DB_SYSTEM_NAME_VALUE_REDIS,
  DB_SYSTEM_VALUE_REDIS,
} from './semconv';

export const endSpan = (
  span: Span,
  err: NodeJS.ErrnoException | null | undefined
) => {
  if (err) {
    span.recordException(err);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err.message,
    });
  }
  span.end();
};

export function getClientAttributes(
  host: string | undefined,
  port: number | undefined,
  semconvStability: SemconvStability
): Attributes {
  const attributes: Attributes = {};

  if (semconvStability & SemconvStability.OLD) {
    Object.assign(attributes, {
      [ATTR_DB_SYSTEM]: DB_SYSTEM_VALUE_REDIS,
      [ATTR_NET_PEER_NAME]: host,
      [ATTR_NET_PEER_PORT]: port,
      [ATTR_DB_CONNECTION_STRING]: `redis://${host}:${port}`,
    });
  }

  if (semconvStability & SemconvStability.STABLE) {
    Object.assign(attributes, {
      [ATTR_DB_SYSTEM_NAME]: DB_SYSTEM_NAME_VALUE_REDIS,
      [ATTR_SERVER_ADDRESS]: host,
      [ATTR_SERVER_PORT]: port,
    });
  }

  return attributes;
}
