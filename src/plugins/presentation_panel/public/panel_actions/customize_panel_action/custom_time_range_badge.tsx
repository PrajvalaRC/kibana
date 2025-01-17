/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { PrettyDuration } from '@elastic/eui';
import {
  Action,
  FrequentCompatibilityChangeAction,
  IncompatibleActionError,
} from '@kbn/ui-actions-plugin/public';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { UI_SETTINGS } from '@kbn/data-plugin/common';
import { apiPublishesUnifiedSearch, EmbeddableApiContext } from '@kbn/presentation-publishing';
import { core } from '../../kibana_services';
import { customizePanelAction } from '../panel_actions';

export const CUSTOM_TIME_RANGE_BADGE = 'CUSTOM_TIME_RANGE_BADGE';

export class CustomTimeRangeBadge
  implements Action<EmbeddableApiContext>, FrequentCompatibilityChangeAction<EmbeddableApiContext>
{
  public readonly type = CUSTOM_TIME_RANGE_BADGE;
  public readonly id = CUSTOM_TIME_RANGE_BADGE;
  public order = 7;

  public getDisplayName({ embeddable }: EmbeddableApiContext) {
    if (!apiPublishesUnifiedSearch(embeddable)) throw new IncompatibleActionError();
    const timeRange = embeddable.timeRange$.value;
    if (!timeRange) return '';
    return renderToString(
      <PrettyDuration
        timeTo={timeRange.to}
        timeFrom={timeRange.from}
        dateFormat={core.uiSettings.get<string>(UI_SETTINGS.DATE_FORMAT) ?? 'Browser'}
      />
    );
  }

  public couldBecomeCompatible({ embeddable }: EmbeddableApiContext) {
    return apiPublishesUnifiedSearch(embeddable);
  }

  public subscribeToCompatibilityChanges(
    { embeddable }: EmbeddableApiContext,
    onChange: (isCompatible: boolean, action: CustomTimeRangeBadge) => void
  ) {
    if (!apiPublishesUnifiedSearch(embeddable)) return;
    return embeddable.timeRange$.subscribe((timeRange) => {
      onChange(Boolean(timeRange), this);
    });
  }

  public async execute({ embeddable }: EmbeddableApiContext) {
    customizePanelAction.execute({ embeddable });
  }

  public getIconType() {
    return 'calendar';
  }

  public async isCompatible({ embeddable }: EmbeddableApiContext) {
    if (apiPublishesUnifiedSearch(embeddable)) {
      const timeRange = embeddable.timeRange$.value;
      return Boolean(timeRange);
    }
    return false;
  }
}
