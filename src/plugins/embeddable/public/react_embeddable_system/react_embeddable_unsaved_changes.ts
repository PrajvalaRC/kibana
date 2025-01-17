/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import {
  getLastSavedStateSubjectForChild,
  PresentationContainer,
  SerializedPanelState,
} from '@kbn/presentation-containers';
import { PublishingSubject } from '@kbn/presentation-publishing';
import { BehaviorSubject, combineLatest } from 'rxjs';
import { combineLatestWith, debounceTime, map } from 'rxjs/operators';
import { EmbeddableStateComparators } from './types';

const defaultComparator = <T>(a: T, b: T) => a === b;

const getInitialValuesFromComparators = <StateType extends object = object>(
  comparators: EmbeddableStateComparators<StateType>,
  comparatorKeys: Array<keyof StateType>
) => {
  const initialValues: Partial<StateType> = {};
  for (const key of comparatorKeys) {
    const comparatorSubject = comparators[key][0]; // 0th element of tuple is the subject
    initialValues[key] = comparatorSubject?.value;
  }
  return initialValues;
};

const getDefaultDiffingApi = () => {
  return {
    unsavedChanges: new BehaviorSubject<object | undefined>(undefined),
    resetUnsavedChanges: () => {},
    cleanup: () => {},
  };
};

const runComparators = <StateType extends object = object>(
  comparators: EmbeddableStateComparators<StateType>,
  comparatorKeys: Array<keyof StateType>,
  lastSavedState: StateType | undefined,
  latestState: Partial<StateType>
) => {
  if (!lastSavedState) {
    // if the parent API provides last saved state, but it's empty for this panel, all of our latest state is unsaved.
    return latestState;
  }
  const latestChanges: Partial<StateType> = {};
  for (const key of comparatorKeys) {
    const customComparator = comparators[key]?.[2]; // 2nd element of the tuple is the custom comparator
    const comparator = customComparator ?? defaultComparator;
    if (!comparator(lastSavedState?.[key], latestState[key], lastSavedState, latestState)) {
      latestChanges[key] = latestState[key];
    }
  }
  return Object.keys(latestChanges).length > 0 ? latestChanges : undefined;
};

export const startTrackingEmbeddableUnsavedChanges = <StateType extends object = object>(
  uuid: string,
  parentApi: PresentationContainer | undefined,
  comparators: EmbeddableStateComparators<StateType>,
  deserializeState: (state: SerializedPanelState<object>) => StateType
) => {
  if (Object.keys(comparators).length === 0) return getDefaultDiffingApi();

  const lastSavedStateSubject = getLastSavedStateSubjectForChild<StateType>(
    parentApi,
    uuid,
    deserializeState
  );
  if (!lastSavedStateSubject) return getDefaultDiffingApi();

  const comparatorSubjects: Array<PublishingSubject<unknown>> = [];
  const comparatorKeys: Array<keyof StateType> = [];
  for (const key of Object.keys(comparators) as Array<keyof StateType>) {
    const comparatorSubject = comparators[key][0]; // 0th element of tuple is the subject
    comparatorSubjects.push(comparatorSubject as PublishingSubject<unknown>);
    comparatorKeys.push(key);
  }

  const unsavedChanges = new BehaviorSubject<Partial<StateType> | undefined>(
    runComparators(
      comparators,
      comparatorKeys,
      lastSavedStateSubject?.getValue(),
      getInitialValuesFromComparators(comparators, comparatorKeys)
    )
  );

  const subscription = combineLatest(comparatorSubjects)
    .pipe(
      debounceTime(100),
      map((latestStates) =>
        comparatorKeys.reduce((acc, key, index) => {
          acc[key] = latestStates[index] as StateType[typeof key];
          return acc;
        }, {} as Partial<StateType>)
      ),
      combineLatestWith(lastSavedStateSubject)
    )
    .subscribe(([latestStates, lastSavedState]) => {
      unsavedChanges.next(
        runComparators(comparators, comparatorKeys, lastSavedState, latestStates)
      );
    });

  return {
    unsavedChanges,
    resetUnsavedChanges: () => {
      const lastSaved = lastSavedStateSubject?.getValue();
      for (const key of comparatorKeys) {
        const setter = comparators[key][1]; // setter function is the 1st element of the tuple
        setter(lastSaved?.[key] as StateType[typeof key]);
      }
    },
    cleanup: () => subscription.unsubscribe(),
  };
};
