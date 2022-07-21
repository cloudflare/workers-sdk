// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as I18n from '../../third_party/i18n/i18n.js';
import * as Platform from '../platform/platform.js';
import * as Root from '../root/root.js';
import { DevToolsLocale } from './DevToolsLocale.js';
const i18nInstance = new I18n.I18n.I18n();
// All the locales that are part of the DevTools bundle and should not be fetched
// remotely. Keep this list in sync with "copied_devtools_locale_files" in
// "all_devtools_files.gni" (except the pseudo locales).
const BUNDLED_LOCALES = new Set(['en-US', 'en-XL', 'zh']);
/**
 * Look up the best available locale for the requested language through these fall backs:
 * - exact match
 * - progressively shorter prefixes (`de-CH-1996` -> `de-CH` -> `de`)
 * - the default locale ('en-US') if no match is found
 *
 * If `locale` isn't provided, the default is used.
 */
export function lookupClosestSupportedDevToolsLocale(locale) {
    return i18nInstance.lookupClosestSupportedLocale(locale);
}
/**
 * Returns a list of all supported DevTools locales, including pseudo locales.
 */
export function getAllSupportedDevToolsLocales() {
    return [...i18nInstance.supportedLocales];
}
/**
 * Returns the Url from which a locale can be fetched. This depends on the
 * specific locale, as some are bundled with DevTools while others
 * have to be fetched remotely.
 */
function getLocaleFetchUrl(locale) {
    const remoteBase = Root.Runtime.getRemoteBase();
    if (remoteBase && remoteBase.base && !BUNDLED_LOCALES.has(locale)) {
        return `${remoteBase.base}core/i18n/locales/${locale}.json`;
    }
    return new URL(`../../core/i18n/locales/${locale}.json`, import.meta.url).toString();
}
/**
 * Fetches the locale data of the specified locale.
 * Callers have to ensure that `locale` is an officilly supported locale.
 * Depending whether a locale is present in `bundledLocales`, the data will be
 * fetched locally or remotely.
 */
export async function fetchAndRegisterLocaleData(locale) {
    const localeDataTextPromise = fetch(getLocaleFetchUrl(locale)).then(result => result.json());
    const timeoutPromise = new Promise((resolve, reject) => window.setTimeout(() => reject(new Error('timed out fetching locale')), 5000));
    const localeData = await Promise.race([timeoutPromise, localeDataTextPromise]);
    i18nInstance.registerLocaleData(locale, localeData);
}
/**
 * Returns an anonymous function that wraps a call to retrieve a localized string.
 * This is introduced so that localized strings can be declared in environments where
 * the i18n system has not been configured and so, cannot be directly invoked. Instead,
 * strings are lazily localized when they are used. This is used for instance in the
 * meta files used to register module extensions.
 */
export function getLazilyComputedLocalizedString(registeredStrings, id, values = {}) {
    return () => getLocalizedString(registeredStrings, id, values);
}
/**
 * Retrieve the localized string.
 */
export function getLocalizedString(registeredStrings, id, values = {}) {
    return registeredStrings.getLocalizedStringSetFor(DevToolsLocale.instance().locale).getLocalizedString(id, values);
}
/**
 * Register a file's UIStrings with i18n, return function to generate the string ids.
 */
export function registerUIStrings(path, stringStructure) {
    return i18nInstance.registerFileStrings(path, stringStructure);
}
/**
 * Returns a span element that may contains other DOM element as placeholders
 */
export function getFormatLocalizedString(registeredStrings, stringId, placeholders) {
    const formatter = registeredStrings.getLocalizedStringSetFor(DevToolsLocale.instance().locale).getMessageFormatterFor(stringId);
    const element = document.createElement('span');
    for (const icuElement of formatter.getAst()) {
        if (icuElement.type === /* argumentElement */ 1) {
            const placeholderValue = placeholders[icuElement.value];
            if (placeholderValue) {
                element.append(placeholderValue);
            }
        }
        else if ('value' in icuElement) {
            element.append(String(icuElement.value));
        }
    }
    return element;
}
export function serializeUIString(string, values = {}) {
    const serializedMessage = { string, values };
    return JSON.stringify(serializedMessage);
}
export function deserializeUIString(serializedMessage) {
    if (!serializedMessage) {
        return { string: '', values: {} };
    }
    return JSON.parse(serializedMessage);
}
/**
 * Use this function in places where a `LocalizedString` is expected but the
 * term/phrase you want to use does not require translation.
 */
export function lockedString(str) {
    return str;
}
/**
 * Same as `lockedString` but for places where `i18nLazyString` would be used otherwise.
 */
export function lockedLazyString(str) {
    return () => str;
}
/**
 * Returns a string of the form:
 *   "German (Austria) - Deutsch (Österreich)"
 * where the former locale representation is written in the currently enabled DevTools
 * locale and the latter locale representation is written in the locale of `localeString`.
 *
 * Should the two locales match (i.e. have the same language) then the latter locale
 * representation is written in English.
 */
export function getLocalizedLanguageRegion(localeString, devtoolsLocale) {
    const locale = new Intl.Locale(localeString);
    Platform.DCHECK(() => locale.language !== undefined);
    Platform.DCHECK(() => locale.baseName !== undefined);
    const localLanguage = locale.language || 'en';
    const localBaseName = locale.baseName || 'en-US';
    const devtoolsLoc = new Intl.Locale(devtoolsLocale.locale);
    const targetLanguage = localLanguage === devtoolsLoc.language ? 'en' : localBaseName;
    const languageInCurrentLocale = new Intl.DisplayNames([devtoolsLocale.locale], { type: 'language' }).of(localLanguage);
    const languageInTargetLocale = new Intl.DisplayNames([targetLanguage], { type: 'language' }).of(localLanguage);
    let wrappedRegionInCurrentLocale = '';
    let wrappedRegionInTargetLocale = '';
    if (locale.region) {
        const regionInCurrentLocale = new Intl.DisplayNames([devtoolsLocale.locale], { type: 'region', style: 'short' }).of(locale.region);
        const regionInTargetLocale = new Intl.DisplayNames([targetLanguage], { type: 'region', style: 'short' }).of(locale.region);
        wrappedRegionInCurrentLocale = ` (${regionInCurrentLocale})`;
        wrappedRegionInTargetLocale = ` (${regionInTargetLocale})`;
    }
    return `${languageInCurrentLocale}${wrappedRegionInCurrentLocale} - ${languageInTargetLocale}${wrappedRegionInTargetLocale}`;
}
//# sourceMappingURL=i18nImpl.js.map