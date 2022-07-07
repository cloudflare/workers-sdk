/**
 * @license
 * Copyright 2017 The Lighthouse Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/** @template T @typedef {import('./i18n').I18n<T>} I18n */

const ELLIPSIS = '\u2026';
const NBSP = '\xa0';
const PASS_THRESHOLD = 0.9;
const SCREENSHOT_PREFIX = 'data:image/jpeg;base64,';

const RATINGS = {
  PASS: {label: 'pass', minScore: PASS_THRESHOLD},
  AVERAGE: {label: 'average', minScore: 0.5},
  FAIL: {label: 'fail'},
  ERROR: {label: 'error'},
};

// 25 most used tld plus one domains (aka public suffixes) from http archive.
// @see https://github.com/GoogleChrome/lighthouse/pull/5065#discussion_r191926212
// The canonical list is https://publicsuffix.org/learn/ but we're only using subset to conserve bytes
const listOfTlds = [
  'com', 'co', 'gov', 'edu', 'ac', 'org', 'go', 'gob', 'or', 'net', 'in', 'ne', 'nic', 'gouv',
  'web', 'spb', 'blog', 'jus', 'kiev', 'mil', 'wi', 'qc', 'ca', 'bel', 'on',
];

class Util {
  /** @type {I18n<typeof UIStrings>} */
  // @ts-expect-error: Is set in report renderer.
  static i18n = null;

  static get PASS_THRESHOLD() {
    return PASS_THRESHOLD;
  }

  static get MS_DISPLAY_VALUE() {
    return `%10d${NBSP}ms`;
  }

  /**
   * Returns a new LHR that's reshaped for slightly better ergonomics within the report rendereer.
   * Also, sets up the localized UI strings used within renderer and makes changes to old LHRs to be
   * compatible with current renderer.
   * The LHR passed in is not mutated.
   * TODO(team): we all agree the LHR shape change is technical debt we should fix
   * @param {LH.Result} result
   * @return {LH.ReportResult}
   */
  static prepareReportResult(result) {
    // If any mutations happen to the report within the renderers, we want the original object untouched
    const clone = /** @type {LH.ReportResult} */ (JSON.parse(JSON.stringify(result)));

    // If LHR is older (≤3.0.3), it has no locale setting. Set default.
    if (!clone.configSettings.locale) {
      clone.configSettings.locale = 'en';
    }
    if (!clone.configSettings.formFactor) {
      // @ts-expect-error fallback handling for emulatedFormFactor
      clone.configSettings.formFactor = clone.configSettings.emulatedFormFactor;
    }

    for (const audit of Object.values(clone.audits)) {
      // Turn 'not-applicable' (LHR <4.0) and 'not_applicable' (older proto versions)
      // into 'notApplicable' (LHR ≥4.0).
      // @ts-expect-error tsc rightly flags that these values shouldn't occur.
      // eslint-disable-next-line max-len
      if (audit.scoreDisplayMode === 'not_applicable' || audit.scoreDisplayMode === 'not-applicable') {
        audit.scoreDisplayMode = 'notApplicable';
      }

      if (audit.details) {
        // Turn `auditDetails.type` of undefined (LHR <4.2) and 'diagnostic' (LHR <5.0)
        // into 'debugdata' (LHR ≥5.0).
        // @ts-expect-error tsc rightly flags that these values shouldn't occur.
        if (audit.details.type === undefined || audit.details.type === 'diagnostic') {
          // @ts-expect-error details is of type never.
          audit.details.type = 'debugdata';
        }

        // Add the jpg data URL prefix to filmstrip screenshots without them (LHR <5.0).
        if (audit.details.type === 'filmstrip') {
          for (const screenshot of audit.details.items) {
            if (!screenshot.data.startsWith(SCREENSHOT_PREFIX)) {
              screenshot.data = SCREENSHOT_PREFIX + screenshot.data;
            }
          }
        }
      }
    }

    // For convenience, smoosh all AuditResults into their auditRef (which has just weight & group)
    if (typeof clone.categories !== 'object') throw new Error('No categories provided.');

    /** @type {Map<string, Array<LH.ReportResult.AuditRef>>} */
    const relevantAuditToMetricsMap = new Map();

    // This backcompat converts old LHRs (<9.0.0) to use the new "hidden" group.
    // Old LHRs used "no group" to identify audits that should be hidden in performance instead of the "hidden" group.
    // Newer LHRs use "no group" to identify opportunities and diagnostics whose groups are assigned by details type.
    const [majorVersion] = clone.lighthouseVersion.split('.').map(Number);
    const perfCategory = clone.categories['performance'];
    if (majorVersion < 9 && perfCategory) {
      if (!clone.categoryGroups) clone.categoryGroups = {};
      clone.categoryGroups['hidden'] = {title: ''};
      for (const auditRef of perfCategory.auditRefs) {
        if (!auditRef.group) {
          auditRef.group = 'hidden';
        } else if (['load-opportunities', 'diagnostics'].includes(auditRef.group)) {
          delete auditRef.group;
        }
      }
    }

    for (const category of Object.values(clone.categories)) {
      // Make basic lookup table for relevantAudits
      category.auditRefs.forEach(metricRef => {
        if (!metricRef.relevantAudits) return;
        metricRef.relevantAudits.forEach(auditId => {
          const arr = relevantAuditToMetricsMap.get(auditId) || [];
          arr.push(metricRef);
          relevantAuditToMetricsMap.set(auditId, arr);
        });
      });

      category.auditRefs.forEach(auditRef => {
        const result = clone.audits[auditRef.id];
        auditRef.result = result;

        // Attach any relevantMetric auditRefs
        if (relevantAuditToMetricsMap.has(auditRef.id)) {
          auditRef.relevantMetrics = relevantAuditToMetricsMap.get(auditRef.id);
        }

        // attach the stackpacks to the auditRef object
        if (clone.stackPacks) {
          clone.stackPacks.forEach(pack => {
            if (pack.descriptions[auditRef.id]) {
              auditRef.stackPacks = auditRef.stackPacks || [];
              auditRef.stackPacks.push({
                title: pack.title,
                iconDataURL: pack.iconDataURL,
                description: pack.descriptions[auditRef.id],
              });
            }
          });
        }
      });
    }

    return clone;
  }

  /**
   * Used to determine if the "passed" for the purposes of showing up in the "failed" or "passed"
   * sections of the report.
   *
   * @param {{score: (number|null), scoreDisplayMode: string}} audit
   * @return {boolean}
   */
  static showAsPassed(audit) {
    switch (audit.scoreDisplayMode) {
      case 'manual':
      case 'notApplicable':
        return true;
      case 'error':
      case 'informative':
        return false;
      case 'numeric':
      case 'binary':
      default:
        return Number(audit.score) >= RATINGS.PASS.minScore;
    }
  }

  /**
   * Convert a score to a rating label.
   * TODO: Return `'error'` for `score === null && !scoreDisplayMode`.
   *
   * @param {number|null} score
   * @param {string=} scoreDisplayMode
   * @return {string}
   */
  static calculateRating(score, scoreDisplayMode) {
    // Handle edge cases first, manual and not applicable receive 'pass', errored audits receive 'error'
    if (scoreDisplayMode === 'manual' || scoreDisplayMode === 'notApplicable') {
      return RATINGS.PASS.label;
    } else if (scoreDisplayMode === 'error') {
      return RATINGS.ERROR.label;
    } else if (score === null) {
      return RATINGS.FAIL.label;
    }

    // At this point, we're rating a standard binary/numeric audit
    let rating = RATINGS.FAIL.label;
    if (score >= RATINGS.PASS.minScore) {
      rating = RATINGS.PASS.label;
    } else if (score >= RATINGS.AVERAGE.minScore) {
      rating = RATINGS.AVERAGE.label;
    }
    return rating;
  }

  /**
   * Split a string by markdown code spans (enclosed in `backticks`), splitting
   * into segments that were enclosed in backticks (marked as `isCode === true`)
   * and those that outside the backticks (`isCode === false`).
   * @param {string} text
   * @return {Array<{isCode: true, text: string}|{isCode: false, text: string}>}
   */
  static splitMarkdownCodeSpans(text) {
    /** @type {Array<{isCode: true, text: string}|{isCode: false, text: string}>} */
    const segments = [];

    // Split on backticked code spans.
    const parts = text.split(/`(.*?)`/g);
    for (let i = 0; i < parts.length; i ++) {
      const text = parts[i];

      // Empty strings are an artifact of splitting, not meaningful.
      if (!text) continue;

      // Alternates between plain text and code segments.
      const isCode = i % 2 !== 0;
      segments.push({
        isCode,
        text,
      });
    }

    return segments;
  }

  /**
   * Split a string on markdown links (e.g. [some link](https://...)) into
   * segments of plain text that weren't part of a link (marked as
   * `isLink === false`), and segments with text content and a URL that did make
   * up a link (marked as `isLink === true`).
   * @param {string} text
   * @return {Array<{isLink: true, text: string, linkHref: string}|{isLink: false, text: string}>}
   */
  static splitMarkdownLink(text) {
    /** @type {Array<{isLink: true, text: string, linkHref: string}|{isLink: false, text: string}>} */
    const segments = [];

    const parts = text.split(/\[([^\]]+?)\]\((https?:\/\/.*?)\)/g);
    while (parts.length) {
      // Shift off the same number of elements as the pre-split and capture groups.
      const [preambleText, linkText, linkHref] = parts.splice(0, 3);

      if (preambleText) { // Skip empty text as it's an artifact of splitting, not meaningful.
        segments.push({
          isLink: false,
          text: preambleText,
        });
      }

      // Append link if there are any.
      if (linkText && linkHref) {
        segments.push({
          isLink: true,
          text: linkText,
          linkHref,
        });
      }
    }

    return segments;
  }

  /**
   * @param {URL} parsedUrl
   * @param {{numPathParts?: number, preserveQuery?: boolean, preserveHost?: boolean}=} options
   * @return {string}
   */
  static getURLDisplayName(parsedUrl, options) {
    // Closure optional properties aren't optional in tsc, so fallback needs undefined  values.
    options = options || {numPathParts: undefined, preserveQuery: undefined,
      preserveHost: undefined};
    const numPathParts = options.numPathParts !== undefined ? options.numPathParts : 2;
    const preserveQuery = options.preserveQuery !== undefined ? options.preserveQuery : true;
    const preserveHost = options.preserveHost || false;

    let name;

    if (parsedUrl.protocol === 'about:' || parsedUrl.protocol === 'data:') {
      // Handle 'about:*' and 'data:*' URLs specially since they have no path.
      name = parsedUrl.href;
    } else {
      name = parsedUrl.pathname;
      const parts = name.split('/').filter(part => part.length);
      if (numPathParts && parts.length > numPathParts) {
        name = ELLIPSIS + parts.slice(-1 * numPathParts).join('/');
      }

      if (preserveHost) {
        name = `${parsedUrl.host}/${name.replace(/^\//, '')}`;
      }
      if (preserveQuery) {
        name = `${name}${parsedUrl.search}`;
      }
    }

    const MAX_LENGTH = 64;
    if (parsedUrl.protocol !== 'data:') {
      // Always elide hexadecimal hash
      name = name.replace(/([a-f0-9]{7})[a-f0-9]{13}[a-f0-9]*/g, `$1${ELLIPSIS}`);
      // Also elide other hash-like mixed-case strings
      name = name.replace(/([a-zA-Z0-9-_]{9})(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])[a-zA-Z0-9-_]{10,}/g,
        `$1${ELLIPSIS}`);
      // Also elide long number sequences
      name = name.replace(/(\d{3})\d{6,}/g, `$1${ELLIPSIS}`);
      // Merge any adjacent ellipses
      name = name.replace(/\u2026+/g, ELLIPSIS);

      // Elide query params first
      if (name.length > MAX_LENGTH && name.includes('?')) {
        // Try to leave the first query parameter intact
        name = name.replace(/\?([^=]*)(=)?.*/, `?$1$2${ELLIPSIS}`);

        // Remove it all if it's still too long
        if (name.length > MAX_LENGTH) {
          name = name.replace(/\?.*/, `?${ELLIPSIS}`);
        }
      }
    }

    // Elide too long names next
    if (name.length > MAX_LENGTH) {
      const dotIndex = name.lastIndexOf('.');
      if (dotIndex >= 0) {
        name = name.slice(0, MAX_LENGTH - 1 - (name.length - dotIndex)) +
          // Show file extension
          `${ELLIPSIS}${name.slice(dotIndex)}`;
      } else {
        name = name.slice(0, MAX_LENGTH - 1) + ELLIPSIS;
      }
    }

    return name;
  }

  /**
   * Split a URL into a file, hostname and origin for easy display.
   * @param {string} url
   * @return {{file: string, hostname: string, origin: string}}
   */
  static parseURL(url) {
    const parsedUrl = new URL(url);
    return {
      file: Util.getURLDisplayName(parsedUrl),
      hostname: parsedUrl.hostname,
      origin: parsedUrl.origin,
    };
  }

  /**
   * @param {string|URL} value
   * @return {!URL}
   */
  static createOrReturnURL(value) {
    if (value instanceof URL) {
      return value;
    }

    return new URL(value);
  }

  /**
   * Gets the tld of a domain
   *
   * @param {string} hostname
   * @return {string} tld
   */
  static getTld(hostname) {
    const tlds = hostname.split('.').slice(-2);

    if (!listOfTlds.includes(tlds[0])) {
      return `.${tlds[tlds.length - 1]}`;
    }

    return `.${tlds.join('.')}`;
  }

  /**
   * Returns a primary domain for provided hostname (e.g. www.example.com -> example.com).
   * @param {string|URL} url hostname or URL object
   * @return {string}
   */
  static getRootDomain(url) {
    const hostname = Util.createOrReturnURL(url).hostname;
    const tld = Util.getTld(hostname);

    // tld is .com or .co.uk which means we means that length is 1 to big
    // .com => 2 & .co.uk => 3
    const splitTld = tld.split('.');

    // get TLD + root domain
    return hostname.split('.').slice(-splitTld.length).join('.');
  }


  /**
   * @param {LH.Result['configSettings']} settings
   * @return {!{deviceEmulation: string, networkThrottling: string, cpuThrottling: string, summary: string}}
   */
  static getEmulationDescriptions(settings) {
    let cpuThrottling;
    let networkThrottling;
    let summary;

    const throttling = settings.throttling;

    switch (settings.throttlingMethod) {
      case 'provided':
        summary = networkThrottling = cpuThrottling = Util.i18n.strings.throttlingProvided;
        break;
      case 'devtools': {
        const {cpuSlowdownMultiplier, requestLatencyMs} = throttling;
        cpuThrottling = `${Util.i18n.formatNumber(cpuSlowdownMultiplier)}x slowdown (DevTools)`;
        networkThrottling = `${Util.i18n.formatNumber(requestLatencyMs)}${NBSP}ms HTTP RTT, ` +
          `${Util.i18n.formatNumber(throttling.downloadThroughputKbps)}${NBSP}Kbps down, ` +
          `${Util.i18n.formatNumber(throttling.uploadThroughputKbps)}${NBSP}Kbps up (DevTools)`;

        const isSlow4G = () => {
          return requestLatencyMs === 150 * 3.75 &&
            throttling.downloadThroughputKbps === 1.6 * 1024 * 0.9 &&
            throttling.uploadThroughputKbps === 750 * 0.9;
        };
        summary = isSlow4G() ? Util.i18n.strings.runtimeSlow4g : Util.i18n.strings.runtimeCustom;
        break;
      }
      case 'simulate': {
        const {cpuSlowdownMultiplier, rttMs, throughputKbps} = throttling;
        cpuThrottling = `${Util.i18n.formatNumber(cpuSlowdownMultiplier)}x slowdown (Simulated)`;
        networkThrottling = `${Util.i18n.formatNumber(rttMs)}${NBSP}ms TCP RTT, ` +
          `${Util.i18n.formatNumber(throughputKbps)}${NBSP}Kbps throughput (Simulated)`;

        const isSlow4G = () => {
          return rttMs === 150 && throughputKbps === 1.6 * 1024;
        };
        summary = isSlow4G() ? Util.i18n.strings.runtimeSlow4g : Util.i18n.strings.runtimeCustom;
        break;
      }
      default:
        summary = cpuThrottling = networkThrottling = Util.i18n.strings.runtimeUnknown;
    }

    // TODO(paulirish): revise Runtime Settings strings: https://github.com/GoogleChrome/lighthouse/pull/11796
    const deviceEmulation = {
      mobile: Util.i18n.strings.runtimeMobileEmulation,
      desktop: Util.i18n.strings.runtimeDesktopEmulation,
    }[settings.formFactor] || Util.i18n.strings.runtimeNoEmulation;

    return {
      deviceEmulation,
      cpuThrottling,
      networkThrottling,
      summary,
    };
  }

  /**
   * Returns only lines that are near a message, or the first few lines if there are
   * no line messages.
   * @param {LH.Audit.Details.SnippetValue['lines']} lines
   * @param {LH.Audit.Details.SnippetValue['lineMessages']} lineMessages
   * @param {number} surroundingLineCount Number of lines to include before and after
   * the message. If this is e.g. 2 this function might return 5 lines.
   */
  static filterRelevantLines(lines, lineMessages, surroundingLineCount) {
    if (lineMessages.length === 0) {
      // no lines with messages, just return the first bunch of lines
      return lines.slice(0, surroundingLineCount * 2 + 1);
    }

    const minGapSize = 3;
    const lineNumbersToKeep = new Set();
    // Sort messages so we can check lineNumbersToKeep to see how big the gap to
    // the previous line is.
    lineMessages = lineMessages.sort((a, b) => (a.lineNumber || 0) - (b.lineNumber || 0));
    lineMessages.forEach(({lineNumber}) => {
      let firstSurroundingLineNumber = lineNumber - surroundingLineCount;
      let lastSurroundingLineNumber = lineNumber + surroundingLineCount;

      while (firstSurroundingLineNumber < 1) {
        // make sure we still show (surroundingLineCount * 2 + 1) lines in total
        firstSurroundingLineNumber++;
        lastSurroundingLineNumber++;
      }
      // If only a few lines would be omitted normally then we prefer to include
      // extra lines to avoid the tiny gap
      if (lineNumbersToKeep.has(firstSurroundingLineNumber - minGapSize - 1)) {
        firstSurroundingLineNumber -= minGapSize;
      }
      for (let i = firstSurroundingLineNumber; i <= lastSurroundingLineNumber; i++) {
        const surroundingLineNumber = i;
        lineNumbersToKeep.add(surroundingLineNumber);
      }
    });

    return lines.filter(line => lineNumbersToKeep.has(line.lineNumber));
  }

  /**
   * @param {string} categoryId
   */
  static isPluginCategory(categoryId) {
    return categoryId.startsWith('lighthouse-plugin-');
  }

  /**
   * @param {LH.Result.GatherMode} gatherMode
   */
  static shouldDisplayAsFraction(gatherMode) {
    return gatherMode === 'timespan' || gatherMode === 'snapshot';
  }

  /**
   * @param {LH.ReportResult.Category} category
   */
  static calculateCategoryFraction(category) {
    let numPassableAudits = 0;
    let numPassed = 0;
    let numInformative = 0;
    let totalWeight = 0;
    for (const auditRef of category.auditRefs) {
      const auditPassed = Util.showAsPassed(auditRef.result);

      // Don't count the audit if it's manual, N/A, or isn't displayed.
      if (auditRef.group === 'hidden' ||
          auditRef.result.scoreDisplayMode === 'manual' ||
          auditRef.result.scoreDisplayMode === 'notApplicable') {
        continue;
      } else if (auditRef.result.scoreDisplayMode === 'informative') {
        if (!auditPassed) {
          ++numInformative;
        }
        continue;
      }

      ++numPassableAudits;
      totalWeight += auditRef.weight;
      if (auditPassed) numPassed++;
    }
    return {numPassed, numPassableAudits, numInformative, totalWeight};
  }
}

/**
 * Some parts of the report renderer require data found on the LHR. Instead of wiring it
 * through, we have this global.
 * @type {LH.ReportResult | null}
 */
Util.reportJson = null;

/**
 * An always-increasing counter for making unique SVG ID suffixes.
 */
Util.getUniqueSuffix = (() => {
  let svgSuffix = 0;
  return function() {
    return svgSuffix++;
  };
})();

/**
 * Report-renderer-specific strings.
 */
const UIStrings = {
  /** Disclaimer shown to users below the metric values (First Contentful Paint, Time to Interactive, etc) to warn them that the numbers they see will likely change slightly the next time they run Lighthouse. */
  varianceDisclaimer: 'Values are estimated and may vary. The [performance score is calculated](https://web.dev/performance-scoring/) directly from these metrics.',
  /** Text link pointing to an interactive calculator that explains Lighthouse scoring. The link text should be fairly short. */
  calculatorLink: 'See calculator.',
  /** Label preceding a radio control for filtering the list of audits. The radio choices are various performance metrics (FCP, LCP, TBT), and if chosen, the audits in the report are hidden if they are not relevant to the selected metric. */
  showRelevantAudits: 'Show audits relevant to:',
  /** Column heading label for the listing of opportunity audits. Each audit title represents an opportunity. There are only 2 columns, so no strict character limit.  */
  opportunityResourceColumnLabel: 'Opportunity',
  /** Column heading label for the estimated page load savings of opportunity audits. Estimated Savings is the total amount of time (in seconds) that Lighthouse computed could be reduced from the total page load time, if the suggested action is taken. There are only 2 columns, so no strict character limit. */
  opportunitySavingsColumnLabel: 'Estimated Savings',

  /** An error string displayed next to a particular audit when it has errored, but not provided any specific error message. */
  errorMissingAuditInfo: 'Report error: no audit information',
  /** A label, shown next to an audit title or metric title, indicating that there was an error computing it. The user can hover on the label to reveal a tooltip with the extended error message. Translation should be short (< 20 characters). */
  errorLabel: 'Error!',
  /** This label is shown above a bulleted list of warnings. It is shown directly below an audit that produced warnings. Warnings describe situations the user should be aware of, as Lighthouse was unable to complete all the work required on this audit. For example, The 'Unable to decode image (biglogo.jpg)' warning may show up below an image encoding audit. */
  warningHeader: 'Warnings: ',
  /** Section heading shown above a list of passed audits that contain warnings. Audits under this section do not negatively impact the score, but Lighthouse has generated some potentially actionable suggestions that should be reviewed. This section is expanded by default and displays after the failing audits. */
  warningAuditsGroupTitle: 'Passed audits but with warnings',
  /** Section heading shown above a list of audits that are passing. 'Passed' here refers to a passing grade. This section is collapsed by default, as the user should be focusing on the failed audits instead. Users can click this heading to reveal the list. */
  passedAuditsGroupTitle: 'Passed audits',
  /** Section heading shown above a list of audits that do not apply to the page. For example, if an audit is 'Are images optimized?', but the page has no images on it, the audit will be marked as not applicable. This is neither passing or failing. This section is collapsed by default, as the user should be focusing on the failed audits instead. Users can click this heading to reveal the list. */
  notApplicableAuditsGroupTitle: 'Not applicable',
  /** Section heading shown above a list of audits that were not computed by Lighthouse. They serve as a list of suggestions for the user to go and manually check. For example, Lighthouse can't automate testing cross-browser compatibility, so that is listed within this section, so the user is reminded to test it themselves. This section is collapsed by default, as the user should be focusing on the failed audits instead. Users can click this heading to reveal the list. */
  manualAuditsGroupTitle: 'Additional items to manually check',

  /** Label shown preceding any important warnings that may have invalidated the entire report. For example, if the user has Chrome extensions installed, they may add enough performance overhead that Lighthouse's performance metrics are unreliable. If shown, this will be displayed at the top of the report UI. */
  toplevelWarningsMessage: 'There were issues affecting this run of Lighthouse:',

  /** String of text shown in a graphical representation of the flow of network requests for the web page. This label represents the initial network request that fetches an HTML page. This navigation may be redirected (eg. Initial navigation to http://example.com redirects to https://www.example.com). */
  crcInitialNavigation: 'Initial Navigation',
  /** Label of value shown in the summary of critical request chains. Refers to the total amount of time (milliseconds) of the longest critical path chain/sequence of network requests. Example value: 2310 ms */
  crcLongestDurationLabel: 'Maximum critical path latency:',

  /** Label for button that shows all lines of the snippet when clicked */
  snippetExpandButtonLabel: 'Expand snippet',
  /** Label for button that only shows a few lines of the snippet when clicked */
  snippetCollapseButtonLabel: 'Collapse snippet',

  /** Explanation shown to users below performance results to inform them that the test was done with a 4G network connection and to warn them that the numbers they see will likely change slightly the next time they run Lighthouse. 'Lighthouse' becomes link text to additional documentation. */
  lsPerformanceCategoryDescription: '[Lighthouse](https://developers.google.com/web/tools/lighthouse/) analysis of the current page on an emulated mobile network. Values are estimated and may vary.',
  /** Title of the lab data section of the Performance category. Within this section are various speed metrics which quantify the pageload performance into values presented in seconds and milliseconds. "Lab" is an abbreviated form of "laboratory", and refers to the fact that the data is from a controlled test of a website, not measurements from real users visiting that site.  */
  labDataTitle: 'Lab Data',

  /** This label is for a checkbox above a table of items loaded by a web page. The checkbox is used to show or hide third-party (or "3rd-party") resources in the table, where "third-party resources" refers to items loaded by a web page from URLs that aren't controlled by the owner of the web page. */
  thirdPartyResourcesLabel: 'Show 3rd-party resources',
  /** This label is for a button that opens a new tab to a webapp called "Treemap", which is a nested visual representation of a heierarchy of data related to the reports (script bytes and coverage, resource breakdown, etc.) */
  viewTreemapLabel: 'View Treemap',
  /** This label is for a button that will show the user a trace of the page. */
  viewTraceLabel: 'View Trace',
  /** This label is for a button that will show the user a trace of the page. */
  viewOriginalTraceLabel: 'View Original Trace',

  /** Option in a dropdown menu that opens a small, summary report in a print dialog.  */
  dropdownPrintSummary: 'Print Summary',
  /** Option in a dropdown menu that opens a full Lighthouse report in a print dialog.  */
  dropdownPrintExpanded: 'Print Expanded',
  /** Option in a dropdown menu that copies the Lighthouse JSON object to the system clipboard. */
  dropdownCopyJSON: 'Copy JSON',
  /** Option in a dropdown menu that saves the Lighthouse report HTML locally to the system as a '.html' file. */
  dropdownSaveHTML: 'Save as HTML',
  /** Option in a dropdown menu that saves the Lighthouse JSON object to the local system as a '.json' file. */
  dropdownSaveJSON: 'Save as JSON',
  /** Option in a dropdown menu that opens the current report in the Lighthouse Viewer Application. */
  dropdownViewer: 'Open in Viewer',
  /** Option in a dropdown menu that saves the current report as a new GitHub Gist. */
  dropdownSaveGist: 'Save as Gist',
  /** Option in a dropdown menu that toggles the themeing of the report between Light(default) and Dark themes. */
  dropdownDarkTheme: 'Toggle Dark Theme',

  /** Label for a row in a table that describes the kind of device that was emulated for the Lighthouse run.  Example values for row elements: 'No Emulation', 'Emulated Desktop', etc. */
  runtimeSettingsDevice: 'Device',
  /** Label for a row in a table that describes the network throttling conditions that were used during a Lighthouse run, if any. */
  runtimeSettingsNetworkThrottling: 'Network throttling',
  /** Label for a row in a table that describes the CPU throttling conditions that were used during a Lighthouse run, if any.*/
  runtimeSettingsCPUThrottling: 'CPU throttling',
  /** Label for a row in a table that shows the User Agent that was used to send out all network requests during the Lighthouse run. */
  runtimeSettingsUANetwork: 'User agent (network)',
  /** Label for a row in a table that shows the estimated CPU power of the machine running Lighthouse. Example row values: 532, 1492, 783. */
  runtimeSettingsBenchmark: 'CPU/Memory Power',
  /** Label for a row in a table that shows the version of the Axe library used. Example row values: 2.1.0, 3.2.3 */
  runtimeSettingsAxeVersion: 'Axe version',

  /** Label for button to create an issue against the Lighthouse GitHub project. */
  footerIssue: 'File an issue',

  /** Descriptive explanation for emulation setting when no device emulation is set. */
  runtimeNoEmulation: 'No emulation',
  /** Descriptive explanation for emulation setting when emulating a Moto G4 mobile device. */
  runtimeMobileEmulation: 'Emulated Moto G4',
  /** Descriptive explanation for emulation setting when emulating a generic desktop form factor, as opposed to a mobile-device like form factor. */
  runtimeDesktopEmulation: 'Emulated Desktop',
  /** Descriptive explanation for a runtime setting that is set to an unknown value. */
  runtimeUnknown: 'Unknown',
  /** Descriptive label that this analysis run was from a single pageload of a browser (not a summary of hundreds of loads) */
  runtimeSingleLoad: 'Single page load',
  /** Descriptive label that this analysis only considers the initial load of the page, and no interaction beyond when the page had "fully loaded" */
  runtimeAnalysisWindow: 'Initial page load',
  /** Descriptive explanation that this analysis run was from a single pageload of a browser, whereas field data often summarizes hundreds+ of page loads */
  runtimeSingleLoadTooltip: 'This data is taken from a single page load, as opposed to field data summarizing many sessions.', // eslint-disable-line max-len

  /** Descriptive explanation for environment throttling that was provided by the runtime environment instead of provided by Lighthouse throttling. */
  throttlingProvided: 'Provided by environment',
  /** Label for an interactive control that will reveal or hide a group of content. This control toggles between the text 'Show' and 'Hide'. */
  show: 'Show',
  /** Label for an interactive control that will reveal or hide a group of content. This control toggles between the text 'Show' and 'Hide'. */
  hide: 'Hide',
  /** Label for an interactive control that will reveal or hide a group of content. This control toggles between the text 'Expand view' and 'Collapse view'. */
  expandView: 'Expand view',
  /** Label for an interactive control that will reveal or hide a group of content. This control toggles between the text 'Expand view' and 'Collapse view'. */
  collapseView: 'Collapse view',
  /** Label indicating that Lighthouse throttled the page to emulate a slow 4G network connection. */
  runtimeSlow4g: 'Slow 4G throttling',
  /** Label indicating that Lighthouse throttled the page using custom throttling settings. */
  runtimeCustom: 'Custom throttling',
};
Util.UIStrings = UIStrings;

// auto-generated by build/build-report-components.js

/** @typedef {import('./dom.js').DOM} DOM */

/* eslint-disable max-len */


/**
 * @param {DOM} dom
 */
function create3pFilterComponent(dom) {
  const el0 = dom.createFragment();
  const el1 = dom.createElement('style');
  el1.append('\n    .lh-3p-filter {\n      color: var(--color-gray-600);\n      float: right;\n      padding: 6px var(--stackpack-padding-horizontal);\n    }\n    .lh-3p-filter-label, .lh-3p-filter-input {\n      vertical-align: middle;\n      user-select: none;\n    }\n    .lh-3p-filter-input:disabled + .lh-3p-ui-string {\n      text-decoration: line-through;\n    }\n  ');
  el0.append(el1);
  const el2 = dom.createElement('div', 'lh-3p-filter');
  const el3 = dom.createElement('label', 'lh-3p-filter-label');
  const el4 = dom.createElement('input', 'lh-3p-filter-input');
  el4.setAttribute('type', 'checkbox');
  el4.setAttribute('checked', '');
  const el5 = dom.createElement('span', 'lh-3p-ui-string');
  el5.append('Show 3rd party resources');
  const el6 = dom.createElement('span', 'lh-3p-filter-count');
  el3.append(' ', el4, ' ', el5, ' (', el6, ') ');
  el2.append(' ', el3, ' ');
  el0.append(el2);
  return el0;
}

/**
 * @param {DOM} dom
 */
function createAuditComponent(dom) {
  const el0 = dom.createFragment();
  const el1 = dom.createElement('div', 'lh-audit');
  const el2 = dom.createElement('details', 'lh-expandable-details');
  const el3 = dom.createElement('summary');
  const el4 = dom.createElement('div', 'lh-audit__header lh-expandable-details__summary');
  const el5 = dom.createElement('span', 'lh-audit__score-icon');
  const el6 = dom.createElement('span', 'lh-audit__title-and-text');
  const el7 = dom.createElement('span', 'lh-audit__title');
  const el8 = dom.createElement('span', 'lh-audit__display-text');
  el6.append(' ', el7, ' ', el8, ' ');
  const el9 = dom.createElement('div', 'lh-chevron-container');
  el4.append(' ', el5, ' ', el6, ' ', el9, ' ');
  el3.append(' ', el4, ' ');
  const el10 = dom.createElement('div', 'lh-audit__description');
  const el11 = dom.createElement('div', 'lh-audit__stackpacks');
  el2.append(' ', el3, ' ', el10, ' ', el11, ' ');
  el1.append(' ', el2, ' ');
  el0.append(el1);
  return el0;
}

/**
 * @param {DOM} dom
 */
function createCategoryHeaderComponent(dom) {
  const el0 = dom.createFragment();
  const el1 = dom.createElement('div', 'lh-category-header');
  const el2 = dom.createElement('div', 'lh-score__gauge');
  el2.setAttribute('role', 'heading');
  el2.setAttribute('aria-level', '2');
  const el3 = dom.createElement('div', 'lh-category-header__description');
  el1.append(' ', el2, ' ', el3, ' ');
  el0.append(el1);
  return el0;
}

/**
 * @param {DOM} dom
 */
function createChevronComponent(dom) {
  const el0 = dom.createFragment();
  const el1 = dom.createElementNS('http://www.w3.org/2000/svg', 'svg', 'lh-chevron');
  el1.setAttribute('viewBox', '0 0 100 100');
  const el2 = dom.createElementNS('http://www.w3.org/2000/svg', 'g', 'lh-chevron__lines');
  const el3 = dom.createElementNS('http://www.w3.org/2000/svg', 'path', 'lh-chevron__line lh-chevron__line-left');
  el3.setAttribute('d', 'M10 50h40');
  const el4 = dom.createElementNS('http://www.w3.org/2000/svg', 'path', 'lh-chevron__line lh-chevron__line-right');
  el4.setAttribute('d', 'M90 50H50');
  el2.append(' ', el3, ' ', el4, ' ');
  el1.append(' ', el2, ' ');
  el0.append(el1);
  return el0;
}

/**
 * @param {DOM} dom
 */
function createClumpComponent(dom) {
  const el0 = dom.createFragment();
  const el1 = dom.createElement('div', 'lh-audit-group');
  const el2 = dom.createElement('details', 'lh-clump');
  const el3 = dom.createElement('summary');
  const el4 = dom.createElement('div', 'lh-audit-group__summary');
  const el5 = dom.createElement('div', 'lh-audit-group__header');
  const el6 = dom.createElement('span', 'lh-audit-group__title');
  const el7 = dom.createElement('span', 'lh-audit-group__itemcount');
  el5.append(' ', el6, ' ', el7, ' ', ' ', ' ');
  const el8 = dom.createElement('div', 'lh-clump-toggle');
  const el9 = dom.createElement('span', 'lh-clump-toggletext--show');
  const el10 = dom.createElement('span', 'lh-clump-toggletext--hide');
  el8.append(' ', el9, ' ', el10, ' ');
  el4.append(' ', el5, ' ', el8, ' ');
  el3.append(' ', el4, ' ');
  el2.append(' ', el3, ' ');
  el1.append(' ', ' ', el2, ' ');
  el0.append(el1);
  return el0;
}

/**
 * @param {DOM} dom
 */
function createCrcComponent(dom) {
  const el0 = dom.createFragment();
  const el1 = dom.createElement('div', 'lh-crc-container');
  const el2 = dom.createElement('style');
  el2.append('\n      .lh-crc .lh-tree-marker {\n        width: 12px;\n        height: 26px;\n        display: block;\n        float: left;\n        background-position: top left;\n      }\n      .lh-crc .lh-horiz-down {\n        background: url(\'data:image/svg+xml;utf8,<svg width="16" height="26" viewBox="0 0 16 26" xmlns="http://www.w3.org/2000/svg"><g fill="%23D8D8D8" fill-rule="evenodd"><path d="M16 12v2H-2v-2z"/><path d="M9 12v14H7V12z"/></g></svg>\');\n      }\n      .lh-crc .lh-right {\n        background: url(\'data:image/svg+xml;utf8,<svg width="16" height="26" viewBox="0 0 16 26" xmlns="http://www.w3.org/2000/svg"><path d="M16 12v2H0v-2z" fill="%23D8D8D8" fill-rule="evenodd"/></svg>\');\n      }\n      .lh-crc .lh-up-right {\n        background: url(\'data:image/svg+xml;utf8,<svg width="16" height="26" viewBox="0 0 16 26" xmlns="http://www.w3.org/2000/svg"><path d="M7 0h2v14H7zm2 12h7v2H9z" fill="%23D8D8D8" fill-rule="evenodd"/></svg>\');\n      }\n      .lh-crc .lh-vert-right {\n        background: url(\'data:image/svg+xml;utf8,<svg width="16" height="26" viewBox="0 0 16 26" xmlns="http://www.w3.org/2000/svg"><path d="M7 0h2v27H7zm2 12h7v2H9z" fill="%23D8D8D8" fill-rule="evenodd"/></svg>\');\n      }\n      .lh-crc .lh-vert {\n        background: url(\'data:image/svg+xml;utf8,<svg width="16" height="26" viewBox="0 0 16 26" xmlns="http://www.w3.org/2000/svg"><path d="M7 0h2v26H7z" fill="%23D8D8D8" fill-rule="evenodd"/></svg>\');\n      }\n      .lh-crc .lh-crc-tree {\n        font-size: 14px;\n        width: 100%;\n        overflow-x: auto;\n      }\n      .lh-crc .lh-crc-node {\n        height: 26px;\n        line-height: 26px;\n        white-space: nowrap;\n      }\n      .lh-crc .lh-crc-node__tree-value {\n        margin-left: 10px;\n      }\n      .lh-crc .lh-crc-node__tree-value div {\n        display: inline;\n      }\n      .lh-crc .lh-crc-node__chain-duration {\n        font-weight: 700;\n      }\n      .lh-crc .lh-crc-initial-nav {\n        color: #595959;\n        font-style: italic;\n      }\n      .lh-crc__summary-value {\n        margin-bottom: 10px;\n      }\n    ');
  const el3 = dom.createElement('div');
  const el4 = dom.createElement('div', 'lh-crc__summary-value');
  const el5 = dom.createElement('span', 'lh-crc__longest_duration_label');
  const el6 = dom.createElement('b', 'lh-crc__longest_duration');
  el4.append(' ', el5, ' ', el6, ' ');
  el3.append(' ', el4, ' ');
  const el7 = dom.createElement('div', 'lh-crc');
  const el8 = dom.createElement('div', 'lh-crc-initial-nav');
  el7.append(' ', el8, ' ', ' ');
  el1.append(' ', el2, ' ', el3, ' ', el7, ' ');
  el0.append(el1);
  return el0;
}

/**
 * @param {DOM} dom
 */
function createCrcChainComponent(dom) {
  const el0 = dom.createFragment();
  const el1 = dom.createElement('div', 'lh-crc-node');
  const el2 = dom.createElement('span', 'lh-crc-node__tree-marker');
  const el3 = dom.createElement('span', 'lh-crc-node__tree-value');
  el1.append(' ', el2, ' ', el3, ' ');
  el0.append(el1);
  return el0;
}

/**
 * @param {DOM} dom
 */
function createElementScreenshotComponent(dom) {
  const el0 = dom.createFragment();
  const el1 = dom.createElement('div', 'lh-element-screenshot');
  const el2 = dom.createElement('div', 'lh-element-screenshot__content');
  const el3 = dom.createElement('div', 'lh-element-screenshot__mask');
  const el4 = dom.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el4.setAttribute('height', '0');
  el4.setAttribute('width', '0');
  const el5 = dom.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const el6 = dom.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
  el6.setAttribute('clipPathUnits', 'objectBoundingBox');
  el5.append(' ', el6, ' ', ' ');
  el4.append(' ', el5, ' ');
  el3.append(' ', el4, ' ');
  const el7 = dom.createElement('div', 'lh-element-screenshot__image');
  const el8 = dom.createElement('div', 'lh-element-screenshot__element-marker');
  el2.append(' ', el3, ' ', el7, ' ', el8, ' ');
  el1.append(' ', el2, ' ');
  el0.append(el1);
  return el0;
}

/**
 * @param {DOM} dom
 */
function createFooterComponent(dom) {
  const el0 = dom.createFragment();
  const el1 = dom.createElement('style');
  el1.append('\n    .lh-footer {\n      padding: var(--footer-padding-vertical) calc(var(--default-padding) * 2);\n      max-width: var(--report-content-max-width);\n      margin: 0 auto;\n    }\n    .lh-footer .lh-generated {\n      text-align: center;\n    }\n  ');
  el0.append(el1);
  const el2 = dom.createElement('footer', 'lh-footer');
  const el3 = dom.createElement('ul', 'lh-meta__items');
  el3.append(' ');
  const el4 = dom.createElement('div', 'lh-generated');
  const el5 = dom.createElement('b');
  el5.append('Lighthouse');
  const el6 = dom.createElement('span', 'lh-footer__version');
  const el7 = dom.createElement('a', 'lh-footer__version_issue');
  el7.setAttribute('href', 'https://github.com/GoogleChrome/Lighthouse/issues');
  el7.setAttribute('target', '_blank');
  el7.setAttribute('rel', 'noopener');
  el7.append('File an issue');
  el4.append(' ', ' Generated by ', el5, ' ', el6, ' | ', el7, ' ');
  el2.append(' ', el3, ' ', el4, ' ');
  el0.append(el2);
  return el0;
}

/**
 * @param {DOM} dom
 */
function createFractionComponent(dom) {
  const el0 = dom.createFragment();
  const el1 = dom.createElement('a', 'lh-fraction__wrapper');
  const el2 = dom.createElement('div', 'lh-fraction__content-wrapper');
  const el3 = dom.createElement('div', 'lh-fraction__content');
  const el4 = dom.createElement('div', 'lh-fraction__background');
  el3.append(' ', el4, ' ');
  el2.append(' ', el3, ' ');
  const el5 = dom.createElement('div', 'lh-fraction__label');
  el1.append(' ', el2, ' ', el5, ' ');
  el0.append(el1);
  return el0;
}

/**
 * @param {DOM} dom
 */
function createGaugeComponent(dom) {
  const el0 = dom.createFragment();
  const el1 = dom.createElement('a', 'lh-gauge__wrapper');
  const el2 = dom.createElement('div', 'lh-gauge__svg-wrapper');
  const el3 = dom.createElementNS('http://www.w3.org/2000/svg', 'svg', 'lh-gauge');
  el3.setAttribute('viewBox', '0 0 120 120');
  const el4 = dom.createElementNS('http://www.w3.org/2000/svg', 'circle', 'lh-gauge-base');
  el4.setAttribute('r', '56');
  el4.setAttribute('cx', '60');
  el4.setAttribute('cy', '60');
  el4.setAttribute('stroke-width', '8');
  const el5 = dom.createElementNS('http://www.w3.org/2000/svg', 'circle', 'lh-gauge-arc');
  el5.setAttribute('r', '56');
  el5.setAttribute('cx', '60');
  el5.setAttribute('cy', '60');
  el5.setAttribute('stroke-width', '8');
  el3.append(' ', el4, ' ', el5, ' ');
  el2.append(' ', el3, ' ');
  const el6 = dom.createElement('div', 'lh-gauge__percentage');
  const el7 = dom.createElement('div', 'lh-gauge__label');
  el1.append(' ', ' ', el2, ' ', el6, ' ', ' ', el7, ' ');
  el0.append(el1);
  return el0;
}

/**
 * @param {DOM} dom
 */
function createGaugePwaComponent(dom) {
  const el0 = dom.createFragment();
  const el1 = dom.createElement('style');
  el1.append('\n    .lh-gauge--pwa .lh-gauge--pwa__component {\n      display: none;\n    }\n    .lh-gauge--pwa__wrapper:not(.lh-badged--all) .lh-gauge--pwa__logo > path {\n      /* Gray logo unless everything is passing. */\n      fill: #B0B0B0;\n    }\n\n    .lh-gauge--pwa__disc {\n      fill: var(--color-gray-200);\n    }\n\n    .lh-gauge--pwa__logo--primary-color {\n      fill: #304FFE;\n    }\n\n    .lh-gauge--pwa__logo--secondary-color {\n      fill: #3D3D3D;\n    }\n    .lh-dark .lh-gauge--pwa__logo--secondary-color {\n      fill: #D8B6B6;\n    }\n\n    /* No passing groups. */\n    .lh-gauge--pwa__wrapper:not([class*=\'lh-badged--\']) .lh-gauge--pwa__na-line {\n      display: inline;\n    }\n    /* Just optimized. Same n/a line as no passing groups. */\n    .lh-gauge--pwa__wrapper.lh-badged--pwa-optimized:not(.lh-badged--pwa-installable) .lh-gauge--pwa__na-line {\n      display: inline;\n    }\n\n    /* Just installable. */\n    .lh-gauge--pwa__wrapper.lh-badged--pwa-installable .lh-gauge--pwa__installable-badge {\n      display: inline;\n    }\n\n    /* All passing groups. */\n    .lh-gauge--pwa__wrapper.lh-badged--all .lh-gauge--pwa__check-circle {\n      display: inline;\n    }\n  ');
  el0.append(el1);
  const el2 = dom.createElement('a', 'lh-gauge__wrapper lh-gauge--pwa__wrapper');
  const el3 = dom.createElementNS('http://www.w3.org/2000/svg', 'svg', 'lh-gauge lh-gauge--pwa');
  el3.setAttribute('viewBox', '0 0 60 60');
  const el4 = dom.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const el5 = dom.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  el5.setAttribute('id', 'lh-gauge--pwa__check-circle__gradient');
  el5.setAttribute('x1', '50%');
  el5.setAttribute('y1', '0%');
  el5.setAttribute('x2', '50%');
  el5.setAttribute('y2', '100%');
  const el6 = dom.createElementNS('http://www.w3.org/2000/svg', 'stop');
  el6.setAttribute('stop-color', '#00C852');
  el6.setAttribute('offset', '0%');
  const el7 = dom.createElementNS('http://www.w3.org/2000/svg', 'stop');
  el7.setAttribute('stop-color', '#009688');
  el7.setAttribute('offset', '100%');
  el5.append(' ', el6, ' ', el7, ' ');
  const el8 = dom.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  el8.setAttribute('id', 'lh-gauge--pwa__installable__shadow-gradient');
  el8.setAttribute('x1', '76.056%');
  el8.setAttribute('x2', '24.111%');
  el8.setAttribute('y1', '82.995%');
  el8.setAttribute('y2', '24.735%');
  const el9 = dom.createElementNS('http://www.w3.org/2000/svg', 'stop');
  el9.setAttribute('stop-color', '#A5D6A7');
  el9.setAttribute('offset', '0%');
  const el10 = dom.createElementNS('http://www.w3.org/2000/svg', 'stop');
  el10.setAttribute('stop-color', '#80CBC4');
  el10.setAttribute('offset', '100%');
  el8.append(' ', el9, ' ', el10, ' ');
  const el11 = dom.createElementNS('http://www.w3.org/2000/svg', 'g');
  el11.setAttribute('id', 'lh-gauge--pwa__installable-badge');
  const el12 = dom.createElementNS('http://www.w3.org/2000/svg', 'circle');
  el12.setAttribute('fill', '#FFFFFF');
  el12.setAttribute('cx', '10');
  el12.setAttribute('cy', '10');
  el12.setAttribute('r', '10');
  const el13 = dom.createElementNS('http://www.w3.org/2000/svg', 'path');
  el13.setAttribute('fill', '#009688');
  el13.setAttribute('d', 'M10 4.167A5.835 5.835 0 0 0 4.167 10 5.835 5.835 0 0 0 10 15.833 5.835 5.835 0 0 0 15.833 10 5.835 5.835 0 0 0 10 4.167zm2.917 6.416h-2.334v2.334H9.417v-2.334H7.083V9.417h2.334V7.083h1.166v2.334h2.334v1.166z');
  el11.append(' ', el12, ' ', el13, ' ');
  el4.append(' ', el5, ' ', el8, ' ', el11, ' ');
  const el14 = dom.createElementNS('http://www.w3.org/2000/svg', 'g');
  el14.setAttribute('stroke', 'none');
  el14.setAttribute('fill-rule', 'nonzero');
  const el15 = dom.createElementNS('http://www.w3.org/2000/svg', 'circle', 'lh-gauge--pwa__disc');
  el15.setAttribute('cx', '30');
  el15.setAttribute('cy', '30');
  el15.setAttribute('r', '30');
  const el16 = dom.createElementNS('http://www.w3.org/2000/svg', 'g', 'lh-gauge--pwa__logo');
  const el17 = dom.createElementNS('http://www.w3.org/2000/svg', 'path', 'lh-gauge--pwa__logo--secondary-color');
  el17.setAttribute('d', 'M35.66 19.39l.7-1.75h2L37.4 15 38.6 12l3.4 9h-2.51l-.58-1.61z');
  const el18 = dom.createElementNS('http://www.w3.org/2000/svg', 'path', 'lh-gauge--pwa__logo--primary-color');
  el18.setAttribute('d', 'M33.52 21l3.65-9h-2.42l-2.5 5.82L30.5 12h-1.86l-1.9 5.82-1.35-2.65-1.21 3.72L25.4 21h2.38l1.72-5.2 1.64 5.2z');
  const el19 = dom.createElementNS('http://www.w3.org/2000/svg', 'path', 'lh-gauge--pwa__logo--secondary-color');
  el19.setAttribute('fill-rule', 'nonzero');
  el19.setAttribute('d', 'M20.3 17.91h1.48c.45 0 .85-.05 1.2-.15l.39-1.18 1.07-3.3a2.64 2.64 0 0 0-.28-.37c-.55-.6-1.36-.91-2.42-.91H18v9h2.3V17.9zm1.96-3.84c.22.22.33.5.33.87 0 .36-.1.65-.29.87-.2.23-.59.35-1.15.35h-.86v-2.41h.87c.52 0 .89.1 1.1.32z');
  el16.append(' ', el17, ' ', el18, ' ', el19, ' ');
  const el20 = dom.createElementNS('http://www.w3.org/2000/svg', 'rect', 'lh-gauge--pwa__component lh-gauge--pwa__na-line');
  el20.setAttribute('fill', '#FFFFFF');
  el20.setAttribute('x', '20');
  el20.setAttribute('y', '32');
  el20.setAttribute('width', '20');
  el20.setAttribute('height', '4');
  el20.setAttribute('rx', '2');
  const el21 = dom.createElementNS('http://www.w3.org/2000/svg', 'g', 'lh-gauge--pwa__component lh-gauge--pwa__installable-badge');
  el21.setAttribute('transform', 'translate(20, 29)');
  const el22 = dom.createElementNS('http://www.w3.org/2000/svg', 'path');
  el22.setAttribute('fill', 'url(#lh-gauge--pwa__installable__shadow-gradient)');
  el22.setAttribute('d', 'M33.629 19.487c-4.272 5.453-10.391 9.39-17.415 10.869L3 17.142 17.142 3 33.63 19.487z');
  const el23 = dom.createElementNS('http://www.w3.org/2000/svg', 'use');
  el23.setAttribute('href', '#lh-gauge--pwa__installable-badge');
  el21.append(' ', el22, ' ', el23, ' ');
  const el24 = dom.createElementNS('http://www.w3.org/2000/svg', 'g', 'lh-gauge--pwa__component lh-gauge--pwa__check-circle');
  el24.setAttribute('transform', 'translate(18, 28)');
  const el25 = dom.createElementNS('http://www.w3.org/2000/svg', 'circle');
  el25.setAttribute('fill', '#FFFFFF');
  el25.setAttribute('cx', '12');
  el25.setAttribute('cy', '12');
  el25.setAttribute('r', '12');
  const el26 = dom.createElementNS('http://www.w3.org/2000/svg', 'path');
  el26.setAttribute('fill', 'url(#lh-gauge--pwa__check-circle__gradient)');
  el26.setAttribute('d', 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z');
  el24.append(' ', el25, ' ', el26, ' ');
  el14.append(' ', ' ', el15, ' ', el16, ' ', ' ', el20, ' ', ' ', el21, ' ', ' ', el24, ' ');
  el3.append(' ', el4, ' ', el14, ' ');
  const el27 = dom.createElement('div', 'lh-gauge__label');
  el2.append(' ', el3, ' ', el27, ' ');
  el0.append(el2);
  return el0;
}

/**
 * @param {DOM} dom
 */
function createHeadingComponent(dom) {
  const el0 = dom.createFragment();
  const el1 = dom.createElement('style');
  el1.append('\n    /* CSS Fireworks. Originally by Eddie Lin\n       https://codepen.io/paulirish/pen/yEVMbP\n    */\n    .lh-pyro {\n      display: none;\n      z-index: 1;\n      pointer-events: none;\n    }\n    .lh-score100 .lh-pyro {\n      display: block;\n    }\n    .lh-score100 .lh-lighthouse stop:first-child {\n      stop-color: hsla(200, 12%, 95%, 0);\n    }\n    .lh-score100 .lh-lighthouse stop:last-child {\n      stop-color: hsla(65, 81%, 76%, 1);\n    }\n\n    .lh-pyro > .lh-pyro-before, .lh-pyro > .lh-pyro-after {\n      position: absolute;\n      width: 5px;\n      height: 5px;\n      border-radius: 2.5px;\n      box-shadow: 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff, 0 0 #fff;\n      animation: 1s bang ease-out infinite backwards,  1s gravity ease-in infinite backwards,  5s position linear infinite backwards;\n      animation-delay: 1s, 1s, 1s;\n    }\n\n    .lh-pyro > .lh-pyro-after {\n      animation-delay: 2.25s, 2.25s, 2.25s;\n      animation-duration: 1.25s, 1.25s, 6.25s;\n    }\n\n    @keyframes bang {\n      to {\n        box-shadow: -70px -115.67px #47ebbc, -28px -99.67px #eb47a4, 58px -31.67px #7eeb47, 13px -141.67px #eb47c5, -19px 6.33px #7347eb, -2px -74.67px #ebd247, 24px -151.67px #eb47e0, 57px -138.67px #b4eb47, -51px -104.67px #479eeb, 62px 8.33px #ebcf47, -93px 0.33px #d547eb, -16px -118.67px #47bfeb, 53px -84.67px #47eb83, 66px -57.67px #eb47bf, -93px -65.67px #91eb47, 30px -13.67px #86eb47, -2px -59.67px #83eb47, -44px 1.33px #eb47eb, 61px -58.67px #47eb73, 5px -22.67px #47e8eb, -66px -28.67px #ebe247, 42px -123.67px #eb5547, -75px 26.33px #7beb47, 15px -52.67px #a147eb, 36px -51.67px #eb8347, -38px -12.67px #eb5547, -46px -59.67px #47eb81, 78px -114.67px #eb47ba, 15px -156.67px #eb47bf, -36px 1.33px #eb4783, -72px -86.67px #eba147, 31px -46.67px #ebe247, -68px 29.33px #47e2eb, -55px 19.33px #ebe047, -56px 27.33px #4776eb, -13px -91.67px #eb5547, -47px -138.67px #47ebc7, -18px -96.67px #eb47ac, 11px -88.67px #4783eb, -67px -28.67px #47baeb, 53px 10.33px #ba47eb, 11px 19.33px #5247eb, -5px -11.67px #eb4791, -68px -4.67px #47eba7, 95px -37.67px #eb478b, -67px -162.67px #eb5d47, -54px -120.67px #eb6847, 49px -12.67px #ebe047, 88px 8.33px #47ebda, 97px 33.33px #eb8147, 6px -71.67px #ebbc47;\n      }\n    }\n    @keyframes gravity {\n      to {\n        transform: translateY(80px);\n        opacity: 0;\n      }\n    }\n    @keyframes position {\n      0%, 19.9% {\n        margin-top: 4%;\n        margin-left: 47%;\n      }\n      20%, 39.9% {\n        margin-top: 7%;\n        margin-left: 30%;\n      }\n      40%, 59.9% {\n        margin-top: 6%;\n        margin-left: 70%;\n      }\n      60%, 79.9% {\n        margin-top: 3%;\n        margin-left: 20%;\n      }\n      80%, 99.9% {\n        margin-top: 3%;\n        margin-left: 80%;\n      }\n    }\n  ');
  el0.append(el1);
  const el2 = dom.createElement('div', 'lh-header-container');
  const el3 = dom.createElement('div', 'lh-scores-wrapper-placeholder');
  el2.append(' ', el3, ' ');
  el0.append(el2);
  return el0;
}

/**
 * @param {DOM} dom
 */
function createMetricComponent(dom) {
  const el0 = dom.createFragment();
  const el1 = dom.createElement('div', 'lh-metric');
  const el2 = dom.createElement('div', 'lh-metric__innerwrap');
  const el3 = dom.createElement('div', 'lh-metric__icon');
  const el4 = dom.createElement('span', 'lh-metric__title');
  const el5 = dom.createElement('div', 'lh-metric__value');
  const el6 = dom.createElement('div', 'lh-metric__description');
  el2.append(' ', el3, ' ', el4, ' ', el5, ' ', el6, ' ');
  el1.append(' ', el2, ' ');
  el0.append(el1);
  return el0;
}

/**
 * @param {DOM} dom
 */
function createOpportunityComponent(dom) {
  const el0 = dom.createFragment();
  const el1 = dom.createElement('div', 'lh-audit lh-audit--load-opportunity');
  const el2 = dom.createElement('details', 'lh-expandable-details');
  const el3 = dom.createElement('summary');
  const el4 = dom.createElement('div', 'lh-audit__header');
  const el5 = dom.createElement('div', 'lh-load-opportunity__cols');
  const el6 = dom.createElement('div', 'lh-load-opportunity__col lh-load-opportunity__col--one');
  const el7 = dom.createElement('span', 'lh-audit__score-icon');
  const el8 = dom.createElement('div', 'lh-audit__title');
  el6.append(' ', el7, ' ', el8, ' ');
  const el9 = dom.createElement('div', 'lh-load-opportunity__col lh-load-opportunity__col--two');
  const el10 = dom.createElement('div', 'lh-load-opportunity__sparkline');
  const el11 = dom.createElement('div', 'lh-sparkline');
  const el12 = dom.createElement('div', 'lh-sparkline__bar');
  el11.append(el12);
  el10.append(' ', el11, ' ');
  const el13 = dom.createElement('div', 'lh-audit__display-text');
  const el14 = dom.createElement('div', 'lh-chevron-container');
  el9.append(' ', el10, ' ', el13, ' ', el14, ' ');
  el5.append(' ', el6, ' ', el9, ' ');
  el4.append(' ', el5, ' ');
  el3.append(' ', el4, ' ');
  const el15 = dom.createElement('div', 'lh-audit__description');
  const el16 = dom.createElement('div', 'lh-audit__stackpacks');
  el2.append(' ', el3, ' ', el15, ' ', el16, ' ');
  el1.append(' ', el2, ' ');
  el0.append(el1);
  return el0;
}

/**
 * @param {DOM} dom
 */
function createOpportunityHeaderComponent(dom) {
  const el0 = dom.createFragment();
  const el1 = dom.createElement('div', 'lh-load-opportunity__header lh-load-opportunity__cols');
  const el2 = dom.createElement('div', 'lh-load-opportunity__col lh-load-opportunity__col--one');
  const el3 = dom.createElement('div', 'lh-load-opportunity__col lh-load-opportunity__col--two');
  el1.append(' ', el2, ' ', el3, ' ');
  el0.append(el1);
  return el0;
}

/**
 * @param {DOM} dom
 */
function createScorescaleComponent(dom) {
  const el0 = dom.createFragment();
  const el1 = dom.createElement('div', 'lh-scorescale');
  const el2 = dom.createElement('span', 'lh-scorescale-range lh-scorescale-range--fail');
  el2.append('0–49');
  const el3 = dom.createElement('span', 'lh-scorescale-range lh-scorescale-range--average');
  el3.append('50–89');
  const el4 = dom.createElement('span', 'lh-scorescale-range lh-scorescale-range--pass');
  el4.append('90–100');
  el1.append(' ', el2, ' ', el3, ' ', el4, ' ');
  el0.append(el1);
  return el0;
}

/**
 * @param {DOM} dom
 */
function createScoresWrapperComponent(dom) {
  const el0 = dom.createFragment();
  const el1 = dom.createElement('style');
  el1.append('\n    .lh-scores-container {\n      display: flex;\n      flex-direction: column;\n      padding: var(--default-padding) 0;\n      position: relative;\n      width: 100%;\n    }\n\n    .lh-sticky-header {\n      --gauge-circle-size: var(--gauge-circle-size-sm);\n      --plugin-badge-size: 16px;\n      --plugin-icon-size: 75%;\n      --gauge-wrapper-width: 60px;\n      --gauge-percentage-font-size: 13px;\n      position: fixed;\n      left: 0;\n      right: 0;\n      top: var(--topbar-height);\n      font-weight: 500;\n      display: none;\n      justify-content: center;\n      background-color: var(--sticky-header-background-color);\n      border-bottom: 1px solid var(--color-gray-200);\n      padding-top: var(--score-container-padding);\n      padding-bottom: 4px;\n      z-index: 1;\n      pointer-events: none;\n    }\n\n    .lh-devtools .lh-sticky-header {\n      /* The report within DevTools is placed in a container with overflow, which changes the placement of this header unless we change `position` to `sticky.` */\n      position: sticky;\n    }\n\n    .lh-sticky-header--visible {\n      display: grid;\n      grid-auto-flow: column;\n      pointer-events: auto;\n    }\n\n    /* Disable the gauge arc animation for the sticky header, so toggling display: none\n       does not play the animation. */\n    .lh-sticky-header .lh-gauge-arc {\n      animation: none;\n    }\n\n    .lh-sticky-header .lh-gauge__label,\n    .lh-sticky-header .lh-fraction__label {\n      display: none;\n    }\n\n    .lh-highlighter {\n      width: var(--gauge-wrapper-width);\n      height: 1px;\n      background-color: var(--highlighter-background-color);\n      /* Position at bottom of first gauge in sticky header. */\n      position: absolute;\n      grid-column: 1;\n      bottom: -1px;\n    }\n\n    .lh-gauge__wrapper:first-of-type {\n      contain: none;\n    }\n  ');
  el0.append(el1);
  const el2 = dom.createElement('div', 'lh-scores-wrapper');
  const el3 = dom.createElement('div', 'lh-scores-container');
  const el4 = dom.createElement('div', 'lh-pyro');
  const el5 = dom.createElement('div', 'lh-pyro-before');
  const el6 = dom.createElement('div', 'lh-pyro-after');
  el4.append(' ', el5, ' ', el6, ' ');
  el3.append(' ', el4, ' ');
  el2.append(' ', el3, ' ');
  el0.append(el2);
  return el0;
}

/**
 * @param {DOM} dom
 */
function createSnippetComponent(dom) {
  const el0 = dom.createFragment();
  const el1 = dom.createElement('div', 'lh-snippet');
  const el2 = dom.createElement('style');
  el2.append('\n          :root {\n            --snippet-highlight-light: #fbf1f2;\n            --snippet-highlight-dark: #ffd6d8;\n          }\n\n         .lh-snippet__header {\n          position: relative;\n          overflow: hidden;\n          padding: 10px;\n          border-bottom: none;\n          color: var(--snippet-color);\n          background-color: var(--snippet-background-color);\n          border: 1px solid var(--report-border-color-secondary);\n        }\n        .lh-snippet__title {\n          font-weight: bold;\n          float: left;\n        }\n        .lh-snippet__node {\n          float: left;\n          margin-left: 4px;\n        }\n        .lh-snippet__toggle-expand {\n          padding: 1px 7px;\n          margin-top: -1px;\n          margin-right: -7px;\n          float: right;\n          background: transparent;\n          border: none;\n          cursor: pointer;\n          font-size: 14px;\n          color: #0c50c7;\n        }\n\n        .lh-snippet__snippet {\n          overflow: auto;\n          border: 1px solid var(--report-border-color-secondary);\n        }\n        /* Container needed so that all children grow to the width of the scroll container */\n        .lh-snippet__snippet-inner {\n          display: inline-block;\n          min-width: 100%;\n        }\n\n        .lh-snippet:not(.lh-snippet--expanded) .lh-snippet__show-if-expanded {\n          display: none;\n        }\n        .lh-snippet.lh-snippet--expanded .lh-snippet__show-if-collapsed {\n          display: none;\n        }\n\n        .lh-snippet__line {\n          background: white;\n          white-space: pre;\n          display: flex;\n        }\n        .lh-snippet__line:not(.lh-snippet__line--message):first-child {\n          padding-top: 4px;\n        }\n        .lh-snippet__line:not(.lh-snippet__line--message):last-child {\n          padding-bottom: 4px;\n        }\n        .lh-snippet__line--content-highlighted {\n          background: var(--snippet-highlight-dark);\n        }\n        .lh-snippet__line--message {\n          background: var(--snippet-highlight-light);\n        }\n        .lh-snippet__line--message .lh-snippet__line-number {\n          padding-top: 10px;\n          padding-bottom: 10px;\n        }\n        .lh-snippet__line--message code {\n          padding: 10px;\n          padding-left: 5px;\n          color: var(--color-fail);\n          font-family: var(--report-font-family);\n        }\n        .lh-snippet__line--message code {\n          white-space: normal;\n        }\n        .lh-snippet__line-icon {\n          padding-top: 10px;\n          display: none;\n        }\n        .lh-snippet__line--message .lh-snippet__line-icon {\n          display: block;\n        }\n        .lh-snippet__line-icon:before {\n          content: "";\n          display: inline-block;\n          vertical-align: middle;\n          margin-right: 4px;\n          width: var(--score-icon-size);\n          height: var(--score-icon-size);\n          background-image: var(--fail-icon-url);\n        }\n        .lh-snippet__line-number {\n          flex-shrink: 0;\n          width: 40px;\n          text-align: right;\n          font-family: monospace;\n          padding-right: 5px;\n          margin-right: 5px;\n          color: var(--color-gray-600);\n          user-select: none;\n        }\n    ');
  el1.append(' ', el2, ' ');
  el0.append(el1);
  return el0;
}

/**
 * @param {DOM} dom
 */
function createSnippetContentComponent(dom) {
  const el0 = dom.createFragment();
  const el1 = dom.createElement('div', 'lh-snippet__snippet');
  const el2 = dom.createElement('div', 'lh-snippet__snippet-inner');
  el1.append(' ', el2, ' ');
  el0.append(el1);
  return el0;
}

/**
 * @param {DOM} dom
 */
function createSnippetHeaderComponent(dom) {
  const el0 = dom.createFragment();
  const el1 = dom.createElement('div', 'lh-snippet__header');
  const el2 = dom.createElement('div', 'lh-snippet__title');
  const el3 = dom.createElement('div', 'lh-snippet__node');
  const el4 = dom.createElement('button', 'lh-snippet__toggle-expand');
  const el5 = dom.createElement('span', 'lh-snippet__btn-label-collapse lh-snippet__show-if-expanded');
  const el6 = dom.createElement('span', 'lh-snippet__btn-label-expand lh-snippet__show-if-collapsed');
  el4.append(' ', el5, ' ', el6, ' ');
  el1.append(' ', el2, ' ', el3, ' ', el4, ' ');
  el0.append(el1);
  return el0;
}

/**
 * @param {DOM} dom
 */
function createSnippetLineComponent(dom) {
  const el0 = dom.createFragment();
  const el1 = dom.createElement('div', 'lh-snippet__line');
  const el2 = dom.createElement('div', 'lh-snippet__line-number');
  const el3 = dom.createElement('div', 'lh-snippet__line-icon');
  const el4 = dom.createElement('code');
  el1.append(' ', el2, ' ', el3, ' ', el4, ' ');
  el0.append(el1);
  return el0;
}

/**
 * @param {DOM} dom
 */
function createStylesComponent(dom) {
  const el0 = dom.createFragment();
  const el1 = dom.createElement('style');
  el1.append('/**\n * @license\n * Copyright 2017 The Lighthouse Authors. All Rights Reserved.\n *\n * Licensed under the Apache License, Version 2.0 (the "License");\n * you may not use this file except in compliance with the License.\n * You may obtain a copy of the License at\n *\n *      http://www.apache.org/licenses/LICENSE-2.0\n *\n * Unless required by applicable law or agreed to in writing, software\n * distributed under the License is distributed on an "AS-IS" BASIS,\n * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.\n * See the License for the specific language governing permissions and\n * limitations under the License.\n */\n\n/*\n  Naming convention:\n\n  If a variable is used for a specific component: --{component}-{property name}-{modifier}\n\n  Both {component} and {property name} should be kebab-case. If the target is the entire page,\n  use \'report\' for the component. The property name should not be abbreviated. Use the\n  property name the variable is intended for - if it\'s used for multiple, a common descriptor\n  is fine (ex: \'size\' for a variable applied to \'width\' and \'height\'). If a variable is shared\n  across multiple components, either create more variables or just drop the "{component}-"\n  part of the name. Append any modifiers at the end (ex: \'big\', \'dark\').\n\n  For colors: --color-{hue}-{intensity}\n\n  {intensity} is the Material Design tag - 700, A700, etc.\n*/\n.lh-vars {\n  /* Palette using Material Design Colors\n   * https://www.materialui.co/colors */\n  --color-amber-50: #FFF8E1;\n  --color-blue-200: #90CAF9;\n  --color-blue-900: #0D47A1;\n  --color-blue-A700: #2962FF;\n  --color-blue-primary: #06f;\n  --color-cyan-500: #00BCD4;\n  --color-gray-100: #F5F5F5;\n  --color-gray-300: #CFCFCF;\n  --color-gray-200: #E0E0E0;\n  --color-gray-400: #BDBDBD;\n  --color-gray-50: #FAFAFA;\n  --color-gray-500: #9E9E9E;\n  --color-gray-600: #757575;\n  --color-gray-700: #616161;\n  --color-gray-800: #424242;\n  --color-gray-900: #212121;\n  --color-gray: #000000;\n  --color-green-700: #080;\n  --color-green: #0c6;\n  --color-lime-400: #D3E156;\n  --color-orange-50: #FFF3E0;\n  --color-orange-700: #C33300;\n  --color-orange: #fa3;\n  --color-red-700: #c00;\n  --color-red: #f33;\n  --color-teal-600: #00897B;\n  --color-white: #FFFFFF;\n\n  /* Context-specific colors */\n  --color-average-secondary: var(--color-orange-700);\n  --color-average: var(--color-orange);\n  --color-fail-secondary: var(--color-red-700);\n  --color-fail: var(--color-red);\n  --color-hover: var(--color-gray-50);\n  --color-informative: var(--color-blue-900);\n  --color-pass-secondary: var(--color-green-700);\n  --color-pass: var(--color-green);\n  --color-not-applicable: var(--color-gray-600);\n\n  /* Component variables */\n  --audit-description-padding-left: calc(var(--score-icon-size) + var(--score-icon-margin-left) + var(--score-icon-margin-right));\n  --audit-explanation-line-height: 16px;\n  --audit-group-margin-bottom: calc(var(--default-padding) * 6);\n  --audit-group-padding-vertical: 8px;\n  --audit-margin-horizontal: 5px;\n  --audit-padding-vertical: 8px;\n  --category-padding: calc(var(--default-padding) * 6) var(--edge-gap-padding) calc(var(--default-padding) * 4);\n  --chevron-line-stroke: var(--color-gray-600);\n  --chevron-size: 12px;\n  --default-padding: 8px;\n  --edge-gap-padding: calc(var(--default-padding) * 4);\n  --env-item-background-color: var(--color-gray-100);\n  --env-item-font-size: 28px;\n  --env-item-line-height: 36px;\n  --env-item-padding: 10px 0px;\n  --env-name-min-width: 220px;\n  --footer-padding-vertical: 16px;\n  --gauge-circle-size-big: 96px;\n  --gauge-circle-size: 48px;\n  --gauge-circle-size-sm: 32px;\n  --gauge-label-font-size-big: 18px;\n  --gauge-label-font-size: var(--report-font-size-secondary);\n  --gauge-label-line-height-big: 24px;\n  --gauge-label-line-height: var(--report-line-height-secondary);\n  --gauge-percentage-font-size-big: 38px;\n  --gauge-percentage-font-size: var(--report-font-size-secondary);\n  --gauge-wrapper-width: 120px;\n  --header-line-height: 24px;\n  --highlighter-background-color: var(--report-text-color);\n  --icon-square-size: calc(var(--score-icon-size) * 0.88);\n  --image-preview-size: 48px;\n  --link-color: var(--color-blue-primary);\n  --locale-selector-background-color: var(--color-white);\n  --metric-toggle-lines-fill: #7F7F7F;\n  --metric-value-font-size: calc(var(--report-font-size) * 1.8);\n  --metrics-toggle-background-color: var(--color-gray-200);\n  --plugin-badge-background-color: var(--color-white);\n  --plugin-badge-size-big: calc(var(--gauge-circle-size-big) / 2.7);\n  --plugin-badge-size: calc(var(--gauge-circle-size) / 2.7);\n  --plugin-icon-size: 65%;\n  --pwa-icon-margin: 0 var(--default-padding);\n  --pwa-icon-size: var(--topbar-logo-size);\n  --report-background-color: #fff;\n  --report-border-color-secondary: #ebebeb;\n  --report-font-family-monospace: \'Roboto Mono\', \'Menlo\', \'dejavu sans mono\', \'Consolas\', \'Lucida Console\', monospace;\n  --report-font-family: Roboto, Helvetica, Arial, sans-serif;\n  --report-font-size: 14px;\n  --report-font-size-secondary: 12px;\n  --report-icon-size: var(--score-icon-background-size);\n  --report-line-height: 24px;\n  --report-line-height-secondary: 20px;\n  --report-monospace-font-size: calc(var(--report-font-size) * 0.85);\n  --report-text-color-secondary: var(--color-gray-800);\n  --report-text-color: var(--color-gray-900);\n  --report-content-max-width: calc(60 * var(--report-font-size)); /* defaults to 840px */\n  --report-content-min-width: 360px;\n  --report-content-max-width-minus-edge-gap: calc(var(--report-content-max-width) - var(--edge-gap-padding) * 2);\n  --score-container-padding: 8px;\n  --score-icon-background-size: 24px;\n  --score-icon-margin-left: 6px;\n  --score-icon-margin-right: 14px;\n  --score-icon-margin: 0 var(--score-icon-margin-right) 0 var(--score-icon-margin-left);\n  --score-icon-size: 12px;\n  --score-icon-size-big: 16px;\n  --screenshot-overlay-background: rgba(0, 0, 0, 0.3);\n  --section-padding-vertical: calc(var(--default-padding) * 6);\n  --snippet-background-color: var(--color-gray-50);\n  --snippet-color: #0938C2;\n  --sparkline-height: 5px;\n  --stackpack-padding-horizontal: 10px;\n  --sticky-header-background-color: var(--report-background-color);\n  --table-higlight-background-color: hsla(210, 17%, 77%, 0.1);\n  --tools-icon-color: var(--color-gray-600);\n  --topbar-background-color: var(--color-white);\n  --topbar-height: 32px;\n  --topbar-logo-size: 24px;\n  --topbar-padding: 0 8px;\n  --toplevel-warning-background-color: hsla(30, 100%, 75%, 10%);\n  --toplevel-warning-message-text-color: var(--color-average-secondary);\n  --toplevel-warning-padding: 18px;\n  --toplevel-warning-text-color: var(--report-text-color);\n\n  /* SVGs */\n  --plugin-icon-url-dark: url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" viewBox="0 0 24 24" fill="%23FFFFFF"><path d="M0 0h24v24H0z" fill="none"/><path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z"/></svg>\');\n  --plugin-icon-url: url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" viewBox="0 0 24 24" fill="%23757575"><path d="M0 0h24v24H0z" fill="none"/><path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z"/></svg>\');\n\n  --pass-icon-url: url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><title>check</title><path fill="%23178239" d="M24 4C12.95 4 4 12.95 4 24c0 11.04 8.95 20 20 20 11.04 0 20-8.96 20-20 0-11.05-8.96-20-20-20zm-4 30L10 24l2.83-2.83L20 28.34l15.17-15.17L38 16 20 34z"/></svg>\');\n  --average-icon-url: url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><title>info</title><path fill="%23E67700" d="M24 4C12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20S35.05 4 24 4zm2 30h-4V22h4v12zm0-16h-4v-4h4v4z"/></svg>\');\n  --fail-icon-url: url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><title>warn</title><path fill="%23C7221F" d="M2 42h44L24 4 2 42zm24-6h-4v-4h4v4zm0-8h-4v-8h4v8z"/></svg>\');\n\n  --pwa-installable-gray-url: url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"><g fill="none" fill-rule="nonzero"><circle fill="%23DAE0E3" cx="12" cy="12" r="12"/><path d="M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm3.5 7.7h-2.8v2.8h-1.4v-2.8H8.5v-1.4h2.8V8.5h1.4v2.8h2.8v1.4z" fill="%23FFF"/></g></svg>\');\n  --pwa-optimized-gray-url: url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"><g fill="none" fill-rule="evenodd"><rect fill="%23DAE0E3" width="24" height="24" rx="12"/><path fill="%23FFF" d="M12 15.07l3.6 2.18-.95-4.1 3.18-2.76-4.2-.36L12 6.17l-1.64 3.86-4.2.36 3.2 2.76-.96 4.1z"/><path d="M5 5h14v14H5z"/></g></svg>\');\n\n  --pwa-installable-gray-url-dark: url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"><g fill="none" fill-rule="nonzero"><circle fill="%23424242" cx="12" cy="12" r="12"/><path d="M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm3.5 7.7h-2.8v2.8h-1.4v-2.8H8.5v-1.4h2.8V8.5h1.4v2.8h2.8v1.4z" fill="%23FFF"/></g></svg>\');\n  --pwa-optimized-gray-url-dark: url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"><g fill="none" fill-rule="evenodd"><rect fill="%23424242" width="24" height="24" rx="12"/><path fill="%23FFF" d="M12 15.07l3.6 2.18-.95-4.1 3.18-2.76-4.2-.36L12 6.17l-1.64 3.86-4.2.36 3.2 2.76-.96 4.1z"/><path d="M5 5h14v14H5z"/></g></svg>\');\n\n  --pwa-installable-color-url: url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"><g fill-rule="nonzero" fill="none"><circle fill="%230CCE6B" cx="12" cy="12" r="12"/><path d="M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm3.5 7.7h-2.8v2.8h-1.4v-2.8H8.5v-1.4h2.8V8.5h1.4v2.8h2.8v1.4z" fill="%23FFF"/></g></svg>\');\n  --pwa-optimized-color-url: url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"><g fill="none" fill-rule="evenodd"><rect fill="%230CCE6B" width="24" height="24" rx="12"/><path d="M5 5h14v14H5z"/><path fill="%23FFF" d="M12 15.07l3.6 2.18-.95-4.1 3.18-2.76-4.2-.36L12 6.17l-1.64 3.86-4.2.36 3.2 2.76-.96 4.1z"/></g></svg>\');\n\n  --swap-locale-icon-url: url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="#000000"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>\');\n}\n\n@media not print {\n  .lh-dark {\n    /* Pallete */\n    --color-gray-200: var(--color-gray-800);\n    --color-gray-300: #616161;\n    --color-gray-400: var(--color-gray-600);\n    --color-gray-700: var(--color-gray-400);\n    --color-gray-50: #757575;\n    --color-gray-600: var(--color-gray-500);\n    --color-green-700: var(--color-green);\n    --color-orange-700: var(--color-orange);\n    --color-red-700: var(--color-red);\n    --color-teal-600: var(--color-cyan-500);\n\n    /* Context-specific colors */\n    --color-hover: rgba(0, 0, 0, 0.2);\n    --color-informative: var(--color-blue-200);\n\n    /* Component variables */\n    --env-item-background-color: #393535;\n    --link-color: var(--color-blue-200);\n    --locale-selector-background-color: var(--color-gray-200);\n    --plugin-badge-background-color: var(--color-gray-800);\n    --report-background-color: var(--color-gray-900);\n    --report-border-color-secondary: var(--color-gray-200);\n    --report-text-color-secondary: var(--color-gray-400);\n    --report-text-color: var(--color-gray-100);\n    --snippet-color: var(--color-cyan-500);\n    --topbar-background-color: var(--color-gray);\n    --toplevel-warning-background-color: hsl(33deg 14% 18%);\n    --toplevel-warning-message-text-color: var(--color-orange-700);\n    --toplevel-warning-text-color: var(--color-gray-100);\n\n    /* SVGs */\n    --plugin-icon-url: var(--plugin-icon-url-dark);\n    --pwa-installable-gray-url: var(--pwa-installable-gray-url-dark);\n    --pwa-optimized-gray-url: var(--pwa-optimized-gray-url-dark);\n  }\n}\n\n@media only screen and (max-width: 480px) {\n  .lh-vars {\n    --audit-group-margin-bottom: 20px;\n    --edge-gap-padding: var(--default-padding);\n    --env-name-min-width: 120px;\n    --gauge-circle-size-big: 96px;\n    --gauge-circle-size: 72px;\n    --gauge-label-font-size-big: 22px;\n    --gauge-label-font-size: 14px;\n    --gauge-label-line-height-big: 26px;\n    --gauge-label-line-height: 20px;\n    --gauge-percentage-font-size-big: 34px;\n    --gauge-percentage-font-size: 26px;\n    --gauge-wrapper-width: 112px;\n    --header-padding: 16px 0 16px 0;\n    --image-preview-size: 24px;\n    --plugin-icon-size: 75%;\n    --pwa-icon-margin: 0 7px 0 -3px;\n    --report-font-size: 14px;\n    --report-line-height: 20px;\n    --score-icon-margin-left: 2px;\n    --score-icon-size: 10px;\n    --topbar-height: 28px;\n    --topbar-logo-size: 20px;\n  }\n\n  /* Not enough space to adequately show the relative savings bars. */\n  .lh-sparkline {\n    display: none;\n  }\n}\n\n.lh-vars.lh-devtools {\n  --audit-explanation-line-height: 14px;\n  --audit-group-margin-bottom: 20px;\n  --audit-group-padding-vertical: 12px;\n  --audit-padding-vertical: 4px;\n  --category-padding: 12px;\n  --default-padding: 12px;\n  --env-name-min-width: 120px;\n  --footer-padding-vertical: 8px;\n  --gauge-circle-size-big: 72px;\n  --gauge-circle-size: 64px;\n  --gauge-label-font-size-big: 22px;\n  --gauge-label-font-size: 14px;\n  --gauge-label-line-height-big: 26px;\n  --gauge-label-line-height: 20px;\n  --gauge-percentage-font-size-big: 34px;\n  --gauge-percentage-font-size: 26px;\n  --gauge-wrapper-width: 97px;\n  --header-line-height: 20px;\n  --header-padding: 16px 0 16px 0;\n  --screenshot-overlay-background: transparent;\n  --plugin-icon-size: 75%;\n  --pwa-icon-margin: 0 7px 0 -3px;\n  --report-font-family-monospace: \'Menlo\', \'dejavu sans mono\', \'Consolas\', \'Lucida Console\', monospace;\n  --report-font-family: \'.SFNSDisplay-Regular\', \'Helvetica Neue\', \'Lucida Grande\', sans-serif;\n  --report-font-size: 12px;\n  --report-line-height: 20px;\n  --score-icon-margin-left: 2px;\n  --score-icon-size: 10px;\n  --section-padding-vertical: 8px;\n}\n\n.lh-devtools.lh-root {\n  height: 100%;\n}\n.lh-devtools.lh-root img {\n  /* Override devtools default \'min-width: 0\' so svg without size in a flexbox isn\'t collapsed. */\n  min-width: auto;\n}\n.lh-devtools .lh-container {\n  overflow-y: scroll;\n  height: calc(100% - var(--topbar-height));\n}\n@media print {\n  .lh-devtools .lh-container {\n    overflow: unset;\n  }\n}\n.lh-devtools .lh-sticky-header {\n  /* This is normally the height of the topbar, but we want it to stick to the top of our scroll container .lh-container` */\n  top: 0;\n}\n.lh-devtools .lh-element-screenshot__overlay {\n  position: absolute;\n}\n\n@keyframes fadeIn {\n  0% { opacity: 0;}\n  100% { opacity: 0.6;}\n}\n\n.lh-root *, .lh-root *::before, .lh-root *::after {\n  box-sizing: border-box;\n}\n\n.lh-root {\n  font-family: var(--report-font-family);\n  font-size: var(--report-font-size);\n  margin: 0;\n  line-height: var(--report-line-height);\n  background: var(--report-background-color);\n  color: var(--report-text-color);\n}\n\n.lh-root :focus {\n    outline: -webkit-focus-ring-color auto 3px;\n}\n.lh-root summary:focus {\n    outline: none;\n    box-shadow: 0 0 0 1px hsl(217, 89%, 61%);\n}\n\n.lh-root [hidden] {\n  display: none !important;\n}\n\n.lh-root pre {\n  margin: 0;\n}\n\n.lh-root details > summary {\n  cursor: pointer;\n}\n\n.lh-hidden {\n  display: none !important;\n}\n\n.lh-container {\n  /*\n  Text wrapping in the report is so much FUN!\n  We have a `word-break: break-word;` globally here to prevent a few common scenarios, namely\n  long non-breakable text (usually URLs) found in:\n    1. The footer\n    2. .lh-node (outerHTML)\n    3. .lh-code\n\n  With that sorted, the next challenge is appropriate column sizing and text wrapping inside our\n  .lh-details tables. Even more fun.\n    * We don\'t want table headers ("Potential Savings (ms)") to wrap or their column values, but\n    we\'d be happy for the URL column to wrap if the URLs are particularly long.\n    * We want the narrow columns to remain narrow, providing the most column width for URL\n    * We don\'t want the table to extend past 100% width.\n    * Long URLs in the URL column can wrap. Util.getURLDisplayName maxes them out at 64 characters,\n      but they do not get any overflow:ellipsis treatment.\n  */\n  word-break: break-word;\n}\n\n.lh-audit-group a,\n.lh-category-header__description a,\n.lh-audit__description a,\n.lh-warnings a,\n.lh-footer a,\n.lh-table-column--link a {\n  color: var(--link-color);\n}\n\n.lh-audit__description, .lh-audit__stackpack {\n  --inner-audit-padding-right: var(--stackpack-padding-horizontal);\n  padding-left: var(--audit-description-padding-left);\n  padding-right: var(--inner-audit-padding-right);\n  padding-top: 8px;\n  padding-bottom: 8px;\n}\n\n.lh-details {\n  margin-top: var(--default-padding);\n  margin-bottom: var(--default-padding);\n  margin-left: var(--audit-description-padding-left);\n  /* whatever the .lh-details side margins are */\n  width: 100%;\n}\n\n.lh-audit__stackpack {\n  display: flex;\n  align-items: center;\n}\n\n.lh-audit__stackpack__img {\n  max-width: 30px;\n  margin-right: var(--default-padding)\n}\n\n/* Report header */\n\n.lh-report-icon {\n  display: flex;\n  align-items: center;\n  padding: 10px 12px;\n  cursor: pointer;\n}\n.lh-report-icon[disabled] {\n  opacity: 0.3;\n  pointer-events: none;\n}\n\n.lh-report-icon::before {\n  content: "";\n  margin: 4px;\n  background-repeat: no-repeat;\n  width: var(--report-icon-size);\n  height: var(--report-icon-size);\n  opacity: 0.7;\n  display: inline-block;\n  vertical-align: middle;\n}\n.lh-report-icon:hover::before {\n  opacity: 1;\n}\n.lh-dark .lh-report-icon::before {\n  filter: invert(1);\n}\n.lh-report-icon--print::before {\n  background-image: url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/><path fill="none" d="M0 0h24v24H0z"/></svg>\');\n}\n.lh-report-icon--copy::before {\n  background-image: url(\'data:image/svg+xml;utf8,<svg height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h24v24H0z" fill="none"/><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>\');\n}\n.lh-report-icon--open::before {\n  background-image: url(\'data:image/svg+xml;utf8,<svg height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h24v24H0z" fill="none"/><path d="M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h4v-2H5V8h14v10h-4v2h4c1.1 0 2-.9 2-2V6c0-1.1-.89-2-2-2zm-7 6l-4 4h3v6h2v-6h3l-4-4z"/></svg>\');\n}\n.lh-report-icon--download::before {\n  background-image: url(\'data:image/svg+xml;utf8,<svg height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/><path d="M0 0h24v24H0z" fill="none"/></svg>\');\n}\n.lh-report-icon--dark::before {\n  background-image:url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 100 125"><path d="M50 23.587c-16.27 0-22.799 12.574-22.799 21.417 0 12.917 10.117 22.451 12.436 32.471h20.726c2.32-10.02 12.436-19.554 12.436-32.471 0-8.843-6.528-21.417-22.799-21.417zM39.637 87.161c0 3.001 1.18 4.181 4.181 4.181h.426l.41 1.231C45.278 94.449 46.042 95 48.019 95h3.963c1.978 0 2.74-.551 3.365-2.427l.409-1.231h.427c3.002 0 4.18-1.18 4.18-4.181V80.91H39.637v6.251zM50 18.265c1.26 0 2.072-.814 2.072-2.073v-9.12C52.072 5.813 51.26 5 50 5c-1.259 0-2.072.813-2.072 2.073v9.12c0 1.259.813 2.072 2.072 2.072zM68.313 23.727c.994.774 2.135.634 2.91-.357l5.614-7.187c.776-.992.636-2.135-.356-2.909-.992-.776-2.135-.636-2.91.357l-5.613 7.186c-.778.993-.636 2.135.355 2.91zM91.157 36.373c-.306-1.222-1.291-1.815-2.513-1.51l-8.85 2.207c-1.222.305-1.814 1.29-1.51 2.512.305 1.223 1.291 1.814 2.513 1.51l8.849-2.206c1.223-.305 1.816-1.291 1.511-2.513zM86.757 60.48l-8.331-3.709c-1.15-.512-2.225-.099-2.736 1.052-.512 1.151-.1 2.224 1.051 2.737l8.33 3.707c1.15.514 2.225.101 2.736-1.05.513-1.149.1-2.223-1.05-2.737zM28.779 23.37c.775.992 1.917 1.131 2.909.357.992-.776 1.132-1.917.357-2.91l-5.615-7.186c-.775-.992-1.917-1.132-2.909-.357s-1.131 1.917-.356 2.909l5.614 7.187zM21.715 39.583c.305-1.223-.288-2.208-1.51-2.513l-8.849-2.207c-1.222-.303-2.208.289-2.513 1.511-.303 1.222.288 2.207 1.511 2.512l8.848 2.206c1.222.304 2.208-.287 2.513-1.509zM21.575 56.771l-8.331 3.711c-1.151.511-1.563 1.586-1.05 2.735.511 1.151 1.586 1.563 2.736 1.052l8.331-3.711c1.151-.511 1.563-1.586 1.05-2.735-.512-1.15-1.585-1.562-2.736-1.052z"/></svg>\');\n}\n.lh-report-icon--treemap::before {\n  background-image: url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="black"><path d="M3 5v14h19V5H3zm2 2h15v4H5V7zm0 10v-4h4v4H5zm6 0v-4h9v4h-9z"/></svg>\');\n}\n.lh-report-icon--date::before {\n  background-image: url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M7 11h2v2H7v-2zm14-5v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6c0-1.1.9-2 2-2h1V2h2v2h8V2h2v2h1a2 2 0 012 2zM5 8h14V6H5v2zm14 12V10H5v10h14zm-4-7h2v-2h-2v2zm-4 0h2v-2h-2v2z"/></svg>\');\n}\n.lh-report-icon--devices::before {\n  background-image: url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 6h18V4H4a2 2 0 00-2 2v11H0v3h14v-3H4V6zm19 2h-6a1 1 0 00-1 1v10c0 .6.5 1 1 1h6c.6 0 1-.5 1-1V9c0-.6-.5-1-1-1zm-1 9h-4v-7h4v7z"/></svg>\');\n}\n.lh-report-icon--world::before {\n  background-image: url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm7 6h-3c-.3-1.3-.8-2.5-1.4-3.6A8 8 0 0 1 18.9 8zm-7-4a14 14 0 0 1 2 4h-4a14 14 0 0 1 2-4zM4.3 14a8.2 8.2 0 0 1 0-4h3.3a16.5 16.5 0 0 0 0 4H4.3zm.8 2h3a14 14 0 0 0 1.3 3.6A8 8 0 0 1 5.1 16zm3-8H5a8 8 0 0 1 4.3-3.6L8 8zM12 20a14 14 0 0 1-2-4h4a14 14 0 0 1-2 4zm2.3-6H9.7a14.7 14.7 0 0 1 0-4h4.6a14.6 14.6 0 0 1 0 4zm.3 5.6c.6-1.2 1-2.4 1.4-3.6h3a8 8 0 0 1-4.4 3.6zm1.8-5.6a16.5 16.5 0 0 0 0-4h3.3a8.2 8.2 0 0 1 0 4h-3.3z"/></svg>\');\n}\n.lh-report-icon--stopwatch::before {\n  background-image: url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.1-6.6L20.5 6l-1.4-1.4L17.7 6A9 9 0 0 0 3 13a9 9 0 1 0 16-5.6zm-7 12.6a7 7 0 1 1 0-14 7 7 0 0 1 0 14z"/></svg>\');\n}\n.lh-report-icon--networkspeed::before {\n  background-image: url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M15.9 5c-.2 0-.3 0-.4.2v.2L10.1 17a2 2 0 0 0-.2 1 2 2 0 0 0 4 .4l2.4-12.9c0-.3-.2-.5-.5-.5zM1 9l2 2c2.9-2.9 6.8-4 10.5-3.6l1.2-2.7C10 3.8 4.7 5.3 1 9zm20 2 2-2a15.4 15.4 0 0 0-5.6-3.6L17 8.2c1.5.7 2.9 1.6 4.1 2.8zm-4 4 2-2a9.9 9.9 0 0 0-2.7-1.9l-.5 3 1.2.9zM5 13l2 2a7.1 7.1 0 0 1 4-2l1.3-2.9C9.7 10.1 7 11 5 13z"/></svg>\');\n}\n.lh-report-icon--samples-one::before {\n  background-image: url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="7" cy="14" r="3"/><path d="M7 18a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm4-2a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm5.6 17.6a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>\');\n}\n.lh-report-icon--samples-many::before {\n  background-image: url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M7 18a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm4-2a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm5.6 17.6a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/><circle cx="7" cy="14" r="3"/><circle cx="11" cy="6" r="3"/></svg>\');\n}\n.lh-report-icon--chrome::before {\n  background-image: url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 562 562"><path d="M256 25.6v25.6a204 204 0 0 1 144.8 60 204 204 0 0 1 60 144.8 204 204 0 0 1-60 144.8 204 204 0 0 1-144.8 60 204 204 0 0 1-144.8-60 204 204 0 0 1-60-144.8 204 204 0 0 1 60-144.8 204 204 0 0 1 144.8-60V0a256 256 0 1 0 0 512 256 256 0 0 0 0-512v25.6z"/><path d="M256 179.2v25.6a51.3 51.3 0 0 1 0 102.4 51.3 51.3 0 0 1 0-102.4v-51.2a102.3 102.3 0 1 0-.1 204.7 102.3 102.3 0 0 0 .1-204.7v25.6z"/><path d="M256 204.8h217.6a25.6 25.6 0 0 0 0-51.2H256a25.6 25.6 0 0 0 0 51.2m44.3 76.8L191.5 470.1a25.6 25.6 0 1 0 44.4 25.6l108.8-188.5a25.6 25.6 0 1 0-44.4-25.6m-88.6 0L102.9 93.2a25.7 25.7 0 0 0-35-9.4 25.7 25.7 0 0 0-9.4 35l108.8 188.5a25.7 25.7 0 0 0 35 9.4 25.9 25.9 0 0 0 9.4-35.1"/></svg>\');\n}\n\n\n\n.lh-buttons {\n  display: flex;\n  flex-wrap: wrap;\n  margin: var(--default-padding) 0;\n}\n.lh-button {\n  height: 32px;\n  border: 1px solid var(--report-border-color-secondary);\n  border-radius: 3px;\n  color: var(--link-color);\n  background-color: var(--report-background-color);\n  margin: 5px;\n}\n\n.lh-button:first-of-type {\n  margin-left: 0;\n}\n\n/* Node */\n.lh-node__snippet {\n  font-family: var(--report-font-family-monospace);\n  color: var(--snippet-color);\n  font-size: var(--report-monospace-font-size);\n  line-height: 20px;\n}\n\n/* Score */\n\n.lh-audit__score-icon {\n  width: var(--score-icon-size);\n  height: var(--score-icon-size);\n  margin: var(--score-icon-margin);\n}\n\n.lh-audit--pass .lh-audit__display-text {\n  color: var(--color-pass-secondary);\n}\n.lh-audit--pass .lh-audit__score-icon,\n.lh-scorescale-range--pass::before {\n  border-radius: 100%;\n  background: var(--color-pass);\n}\n\n.lh-audit--average .lh-audit__display-text {\n  color: var(--color-average-secondary);\n}\n.lh-audit--average .lh-audit__score-icon,\n.lh-scorescale-range--average::before {\n  background: var(--color-average);\n  width: var(--icon-square-size);\n  height: var(--icon-square-size);\n}\n\n.lh-audit--fail .lh-audit__display-text {\n  color: var(--color-fail-secondary);\n}\n.lh-audit--fail .lh-audit__score-icon,\n.lh-audit--error .lh-audit__score-icon,\n.lh-scorescale-range--fail::before {\n  border-left: calc(var(--score-icon-size) / 2) solid transparent;\n  border-right: calc(var(--score-icon-size) / 2) solid transparent;\n  border-bottom: var(--score-icon-size) solid var(--color-fail);\n}\n\n.lh-audit--manual .lh-audit__display-text,\n.lh-audit--notapplicable .lh-audit__display-text {\n  color: var(--color-gray-600);\n}\n.lh-audit--manual .lh-audit__score-icon,\n.lh-audit--notapplicable .lh-audit__score-icon {\n  border: calc(0.2 * var(--score-icon-size)) solid var(--color-gray-400);\n  border-radius: 100%;\n  background: none;\n}\n\n.lh-audit--informative .lh-audit__display-text {\n  color: var(--color-gray-600);\n}\n\n.lh-audit--informative .lh-audit__score-icon {\n  border: calc(0.2 * var(--score-icon-size)) solid var(--color-gray-400);\n  border-radius: 100%;\n}\n\n.lh-audit__description,\n.lh-audit__stackpack {\n  color: var(--report-text-color-secondary);\n}\n.lh-audit__adorn {\n  border: 1px solid slategray;\n  border-radius: 3px;\n  margin: 0 3px;\n  padding: 0 2px;\n  line-height: 1.1;\n  display: inline-block;\n  font-size: 90%;\n}\n\n.lh-category-header__description  {\n  text-align: center;\n  color: var(--color-gray-700);\n  margin: 0px auto;\n  max-width: 400px;\n}\n\n\n.lh-audit__display-text,\n.lh-load-opportunity__sparkline,\n.lh-chevron-container {\n  margin: 0 var(--audit-margin-horizontal);\n}\n.lh-chevron-container {\n  margin-right: 0;\n}\n\n.lh-audit__title-and-text {\n  flex: 1;\n}\n\n.lh-audit__title-and-text code {\n  color: var(--snippet-color);\n  font-size: var(--report-monospace-font-size);\n}\n\n/* Prepend display text with em dash separator. But not in Opportunities. */\n.lh-audit__display-text:not(:empty):before {\n  content: \'—\';\n  margin-right: var(--audit-margin-horizontal);\n}\n.lh-audit-group.lh-audit-group--load-opportunities .lh-audit__display-text:not(:empty):before {\n  display: none;\n}\n\n/* Expandable Details (Audit Groups, Audits) */\n.lh-audit__header {\n  display: flex;\n  align-items: center;\n  padding: var(--default-padding);\n}\n\n.lh-audit--load-opportunity .lh-audit__header {\n  display: block;\n}\n\n\n.lh-metricfilter {\n  display: grid;\n  justify-content: end;\n  align-items: center;\n  grid-auto-flow: column;\n  gap: 4px;\n  color: var(--color-gray-700);\n}\n\n.lh-metricfilter__radio {\n  position: absolute;\n  left: -9999px;\n}\n.lh-metricfilter input[type=\'radio\']:focus-visible + label {\n  outline: -webkit-focus-ring-color auto 1px;\n}\n\n.lh-metricfilter__label {\n  display: inline-flex;\n  padding: 0 4px;\n  height: 16px;\n  text-decoration: underline;\n  align-items: center;\n  cursor: pointer;\n  font-size: 90%;\n}\n\n.lh-metricfilter__label--active {\n  background: var(--color-blue-primary);\n  color: var(--color-white);\n  border-radius: 3px;\n  text-decoration: none;\n}\n/* Give the \'All\' choice a more muted display */\n.lh-metricfilter__label--active[for="metric-All"] {\n  background-color: var(--color-blue-200) !important;\n  color: black !important;\n}\n\n.lh-metricfilter__text {\n  margin-right: 8px;\n}\n\n/* If audits are filtered, hide the itemcount for Passed Audits… */\n.lh-category--filtered .lh-audit-group .lh-audit-group__itemcount {\n  display: none;\n}\n\n\n.lh-audit__header:hover {\n  background-color: var(--color-hover);\n}\n\n/* We want to hide the browser\'s default arrow marker on summary elements. Admittedly, it\'s complicated. */\n.lh-root details > summary {\n  /* Blink 89+ and Firefox will hide the arrow when display is changed from (new) default of `list-item` to block.  https://chromestatus.com/feature/6730096436051968*/\n  display: block;\n}\n/* Safari and Blink <=88 require using the -webkit-details-marker selector */\n.lh-root details > summary::-webkit-details-marker {\n  display: none;\n}\n\n/* Perf Metric */\n\n.lh-metrics-container {\n  display: grid;\n  grid-auto-rows: 1fr;\n  grid-template-columns: 1fr 1fr;\n  grid-column-gap: var(--report-line-height);\n  margin-bottom: var(--default-padding);\n}\n\n.lh-metric {\n  border-top: 1px solid var(--report-border-color-secondary);\n}\n\n.lh-metric:nth-last-child(-n+2) {\n  border-bottom: 1px solid var(--report-border-color-secondary);\n}\n\n\n.lh-metric__innerwrap {\n  display: grid;\n  /**\n   * Icon -- Metric Name\n   *      -- Metric Value\n   */\n  grid-template-columns: calc(var(--score-icon-size) + var(--score-icon-margin-left) + var(--score-icon-margin-right)) 1fr;\n  align-items: center;\n  padding: var(--default-padding);\n}\n\n.lh-metric__details {\n  order: -1;\n}\n\n.lh-metric__title {\n  flex: 1;\n}\n\n.lh-calclink {\n  padding-left: calc(1ex / 3);\n}\n\n.lh-metric__description {\n  display: none;\n  grid-column-start: 2;\n  grid-column-end: 4;\n  color: var(--report-text-color-secondary);\n}\n\n.lh-metric__value {\n  font-size: var(--metric-value-font-size);\n  margin: calc(var(--default-padding) / 2) 0;\n  white-space: nowrap; /* No wrapping between metric value and the icon */\n  grid-column-start: 2;\n}\n\n\n@media screen and (max-width: 535px) {\n  .lh-metrics-container {\n    display: block;\n  }\n\n  .lh-metric {\n    border-bottom: none !important;\n  }\n  .lh-metric:nth-last-child(1) {\n    border-bottom: 1px solid var(--report-border-color-secondary) !important;\n  }\n\n  /* Change the grid to 3 columns for narrow viewport. */\n  .lh-metric__innerwrap {\n  /**\n   * Icon -- Metric Name -- Metric Value\n   */\n    grid-template-columns: calc(var(--score-icon-size) + var(--score-icon-margin-left) + var(--score-icon-margin-right)) 2fr 1fr;\n  }\n  .lh-metric__value {\n    justify-self: end;\n    grid-column-start: unset;\n  }\n}\n\n/* No-JS toggle switch */\n/* Keep this selector sync\'d w/ `magicSelector` in report-ui-features-test.js */\n .lh-metrics-toggle__input:checked ~ .lh-metrics-container .lh-metric__description {\n  display: block;\n}\n\n/* TODO get rid of the SVGS and clean up these some more */\n.lh-metrics-toggle__input {\n  opacity: 0;\n  position: absolute;\n  right: 0;\n  top: 0px;\n}\n\n.lh-metrics-toggle__input + div > label > .lh-metrics-toggle__labeltext--hide,\n.lh-metrics-toggle__input:checked + div > label > .lh-metrics-toggle__labeltext--show {\n  display: none;\n}\n.lh-metrics-toggle__input:checked + div > label > .lh-metrics-toggle__labeltext--hide {\n  display: inline;\n}\n.lh-metrics-toggle__input:focus + div > label {\n  outline: -webkit-focus-ring-color auto 3px;\n}\n\n.lh-metrics-toggle__label {\n  cursor: pointer;\n  font-size: var(--report-font-size-secondary);\n  line-height: var(--report-line-height-secondary);\n  color: var(--color-gray-700);\n}\n\n/* Pushes the metric description toggle button to the right. */\n.lh-audit-group--metrics .lh-audit-group__header {\n  display: flex;\n  justify-content: space-between;\n}\n\n.lh-metric__icon,\n.lh-scorescale-range::before {\n  content: \'\';\n  width: var(--score-icon-size);\n  height: var(--score-icon-size);\n  display: inline-block;\n  margin: var(--score-icon-margin);\n}\n\n.lh-metric--pass .lh-metric__value {\n  color: var(--color-pass-secondary);\n}\n.lh-metric--pass .lh-metric__icon {\n  border-radius: 100%;\n  background: var(--color-pass);\n}\n\n.lh-metric--average .lh-metric__value {\n  color: var(--color-average-secondary);\n}\n.lh-metric--average .lh-metric__icon {\n  background: var(--color-average);\n  width: var(--icon-square-size);\n  height: var(--icon-square-size);\n}\n\n.lh-metric--fail .lh-metric__value {\n  color: var(--color-fail-secondary);\n}\n.lh-metric--fail .lh-metric__icon,\n.lh-metric--error .lh-metric__icon {\n  border-left: calc(var(--score-icon-size) / 2) solid transparent;\n  border-right: calc(var(--score-icon-size) / 2) solid transparent;\n  border-bottom: var(--score-icon-size) solid var(--color-fail);\n}\n\n.lh-metric--error .lh-metric__value,\n.lh-metric--error .lh-metric__description {\n  color: var(--color-fail-secondary);\n}\n\n/* Perf load opportunity */\n\n.lh-load-opportunity__cols {\n  display: flex;\n  align-items: flex-start;\n}\n\n.lh-load-opportunity__header .lh-load-opportunity__col {\n  color: var(--color-gray-600);\n  display: unset;\n  line-height: calc(2.3 * var(--report-font-size));\n}\n\n.lh-load-opportunity__col {\n  display: flex;\n}\n\n.lh-load-opportunity__col--one {\n  flex: 5;\n  align-items: center;\n  margin-right: 2px;\n}\n.lh-load-opportunity__col--two {\n  flex: 4;\n  text-align: right;\n}\n\n.lh-audit--load-opportunity .lh-audit__display-text {\n  text-align: right;\n  flex: 0 0 calc(3 * var(--report-font-size));\n}\n\n\n/* Sparkline */\n\n.lh-load-opportunity__sparkline {\n  flex: 1;\n  margin-top: calc((var(--report-line-height) - var(--sparkline-height)) / 2);\n}\n\n.lh-sparkline {\n  height: var(--sparkline-height);\n  width: 100%;\n}\n\n.lh-sparkline__bar {\n  height: 100%;\n  float: right;\n}\n\n.lh-audit--pass .lh-sparkline__bar {\n  background: var(--color-pass);\n}\n\n.lh-audit--average .lh-sparkline__bar {\n  background: var(--color-average);\n}\n\n.lh-audit--fail .lh-sparkline__bar {\n  background: var(--color-fail);\n}\n\n/* Filmstrip */\n\n.lh-filmstrip-container {\n  /* smaller gap between metrics and filmstrip */\n  margin: -8px auto 0 auto;\n}\n\n.lh-filmstrip {\n  display: grid;\n  justify-content: space-between;\n  padding-bottom: var(--default-padding);\n  width: 100%;\n  grid-template-columns: repeat(auto-fit, 60px);\n}\n\n.lh-filmstrip__frame {\n  text-align: right;\n  position: relative;\n}\n\n.lh-filmstrip__thumbnail {\n  border: 1px solid var(--report-border-color-secondary);\n  max-height: 100px;\n  max-width: 60px;\n}\n\n/* Audit */\n\n.lh-audit {\n  border-bottom: 1px solid var(--report-border-color-secondary);\n}\n\n/* Apply border-top to just the first audit. */\n.lh-audit {\n  border-top: 1px solid var(--report-border-color-secondary);\n}\n.lh-audit ~ .lh-audit {\n  border-top: none;\n}\n\n\n.lh-audit--error .lh-audit__display-text {\n  color: var(--color-fail-secondary);\n}\n\n/* Audit Group */\n\n.lh-audit-group {\n  margin-bottom: var(--audit-group-margin-bottom);\n  position: relative;\n}\n.lh-audit-group--metrics {\n  margin-bottom: calc(var(--audit-group-margin-bottom) / 2);\n}\n\n.lh-audit-group__header::before {\n  /* By default, groups don\'t get an icon */\n  content: none;\n  width: var(--pwa-icon-size);\n  height: var(--pwa-icon-size);\n  margin: var(--pwa-icon-margin);\n  display: inline-block;\n  vertical-align: middle;\n}\n\n/* Style the "over budget" columns red. */\n.lh-audit-group--budgets #performance-budget tbody tr td:nth-child(4),\n.lh-audit-group--budgets #performance-budget tbody tr td:nth-child(5),\n.lh-audit-group--budgets #timing-budget tbody tr td:nth-child(3) {\n  color: var(--color-red-700);\n}\n\n/* Align the "over budget request count" text to be close to the "over budget bytes" column. */\n.lh-audit-group--budgets .lh-table tbody tr td:nth-child(4){\n  text-align: right;\n}\n\n.lh-audit-group--budgets .lh-details--budget {\n  width: 100%;\n  margin: 0 0 var(--default-padding);\n}\n\n.lh-audit-group--pwa-installable .lh-audit-group__header::before {\n  content: \'\';\n  background-image: var(--pwa-installable-gray-url);\n}\n.lh-audit-group--pwa-optimized .lh-audit-group__header::before {\n  content: \'\';\n  background-image: var(--pwa-optimized-gray-url);\n}\n.lh-audit-group--pwa-installable.lh-badged .lh-audit-group__header::before {\n  background-image: var(--pwa-installable-color-url);\n}\n.lh-audit-group--pwa-optimized.lh-badged .lh-audit-group__header::before {\n  background-image: var(--pwa-optimized-color-url);\n}\n\n.lh-audit-group--metrics .lh-audit-group__summary {\n  margin-top: 0;\n  margin-bottom: 0;\n}\n\n.lh-audit-group__summary {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n}\n\n.lh-audit-group__header .lh-chevron {\n  margin-top: calc((var(--report-line-height) - 5px) / 2);\n}\n\n.lh-audit-group__header {\n  letter-spacing: 0.8px;\n  padding: var(--default-padding);\n  padding-left: 0;\n}\n\n.lh-audit-group__header, .lh-audit-group__summary {\n  font-size: var(--report-font-size-secondary);\n  line-height: var(--report-line-height-secondary);\n  color: var(--color-gray-700);\n}\n\n.lh-audit-group__title {\n  text-transform: uppercase;\n  font-weight: 500;\n}\n\n.lh-audit-group__itemcount {\n  color: var(--color-gray-600);\n}\n\n.lh-audit-group__footer {\n  color: var(--color-gray-600);\n  display: block;\n  margin-top: var(--default-padding);\n}\n\n.lh-details,\n.lh-category-header__description,\n.lh-load-opportunity__header,\n.lh-audit-group__footer {\n  font-size: var(--report-font-size-secondary);\n  line-height: var(--report-line-height-secondary);\n}\n\n.lh-audit-explanation {\n  margin: var(--audit-padding-vertical) 0 calc(var(--audit-padding-vertical) / 2) var(--audit-margin-horizontal);\n  line-height: var(--audit-explanation-line-height);\n  display: inline-block;\n}\n\n.lh-audit--fail .lh-audit-explanation {\n  color: var(--color-fail-secondary);\n}\n\n/* Report */\n.lh-list > :not(:last-child) {\n  margin-bottom: calc(var(--default-padding) * 2);\n}\n\n.lh-header-container {\n  display: block;\n  margin: 0 auto;\n  position: relative;\n  word-wrap: break-word;\n}\n\n.lh-header-container .lh-scores-wrapper {\n  border-bottom: 1px solid var(--color-gray-200);\n}\n\n\n.lh-report {\n  min-width: var(--report-content-min-width);\n}\n\n.lh-exception {\n  font-size: large;\n}\n\n.lh-code {\n  white-space: normal;\n  margin-top: 0;\n  font-size: var(--report-monospace-font-size);\n}\n\n.lh-warnings {\n  --item-margin: calc(var(--report-line-height) / 6);\n  color: var(--color-average-secondary);\n  margin: var(--audit-padding-vertical) 0;\n  padding: var(--default-padding)\n    var(--default-padding)\n    var(--default-padding)\n    calc(var(--audit-description-padding-left));\n  background-color: var(--toplevel-warning-background-color);\n}\n.lh-warnings span {\n  font-weight: bold;\n}\n\n.lh-warnings--toplevel {\n  --item-margin: calc(var(--header-line-height) / 4);\n  color: var(--toplevel-warning-text-color);\n  margin-left: auto;\n  margin-right: auto;\n  max-width: var(--report-content-max-width-minus-edge-gap);\n  padding: var(--toplevel-warning-padding);\n  border-radius: 8px;\n}\n\n.lh-warnings__msg {\n  color: var(--toplevel-warning-message-text-color);\n  margin: 0;\n}\n\n.lh-warnings ul {\n  margin: 0;\n}\n.lh-warnings li {\n  margin: var(--item-margin) 0;\n}\n.lh-warnings li:last-of-type {\n  margin-bottom: 0;\n}\n\n.lh-scores-header {\n  display: flex;\n  flex-wrap: wrap;\n  justify-content: center;\n}\n.lh-scores-header__solo {\n  padding: 0;\n  border: 0;\n}\n\n/* Gauge */\n\n.lh-gauge__wrapper--pass {\n  color: var(--color-pass-secondary);\n  fill: var(--color-pass);\n  stroke: var(--color-pass);\n}\n\n.lh-gauge__wrapper--average {\n  color: var(--color-average-secondary);\n  fill: var(--color-average);\n  stroke: var(--color-average);\n}\n\n.lh-gauge__wrapper--fail {\n  color: var(--color-fail-secondary);\n  fill: var(--color-fail);\n  stroke: var(--color-fail);\n}\n\n.lh-gauge__wrapper--not-applicable {\n  color: var(--color-not-applicable);\n  fill: var(--color-not-applicable);\n  stroke: var(--color-not-applicable);\n}\n\n.lh-fraction__wrapper .lh-fraction__content::before {\n  content: \'\';\n  height: var(--score-icon-size);\n  width: var(--score-icon-size);\n  margin: var(--score-icon-margin);\n  display: inline-block;\n}\n.lh-fraction__wrapper--pass .lh-fraction__content {\n  color: var(--color-pass-secondary);\n}\n.lh-fraction__wrapper--pass .lh-fraction__background {\n  background-color: var(--color-pass);\n}\n.lh-fraction__wrapper--pass .lh-fraction__content::before {\n  background-color: var(--color-pass);\n  border-radius: 50%;\n}\n.lh-fraction__wrapper--average .lh-fraction__content {\n  color: var(--color-average-secondary);\n}\n.lh-fraction__wrapper--average .lh-fraction__background,\n.lh-fraction__wrapper--average .lh-fraction__content::before {\n  background-color: var(--color-average);\n}\n.lh-fraction__wrapper--fail .lh-fraction__content {\n  color: var(--color-fail);\n}\n.lh-fraction__wrapper--fail .lh-fraction__background {\n  background-color: var(--color-fail);\n}\n.lh-fraction__wrapper--fail .lh-fraction__content::before {\n  border-left: calc(var(--score-icon-size) / 2) solid transparent;\n  border-right: calc(var(--score-icon-size) / 2) solid transparent;\n  border-bottom: var(--score-icon-size) solid var(--color-fail);\n}\n.lh-fraction__wrapper--null .lh-fraction__content {\n  color: var(--color-gray-700);\n}\n.lh-fraction__wrapper--null .lh-fraction__background {\n  background-color: var(--color-gray-700);\n}\n.lh-fraction__wrapper--null .lh-fraction__content::before {\n  border-radius: 50%;\n  border: calc(0.2 * var(--score-icon-size)) solid var(--color-gray-700);\n}\n\n.lh-fraction__background {\n  position: absolute;\n  height: 100%;\n  width: 100%;\n  border-radius: calc(var(--gauge-circle-size) / 2);\n  opacity: 0.1;\n  z-index: -1;\n}\n\n.lh-fraction__content-wrapper {\n  height: var(--gauge-circle-size);\n  display: flex;\n  align-items: center;\n}\n\n.lh-fraction__content {\n  display: flex;\n  position: relative;\n  align-items: center;\n  justify-content: center;\n  font-size: calc(0.3 * var(--gauge-circle-size));\n  line-height: calc(0.4 * var(--gauge-circle-size));\n  width: max-content;\n  min-width: calc(1.5 * var(--gauge-circle-size));\n  padding: calc(0.1 * var(--gauge-circle-size)) calc(0.2 * var(--gauge-circle-size));\n  --score-icon-size: calc(0.21 * var(--gauge-circle-size));\n  --score-icon-margin: 0 calc(0.15 * var(--gauge-circle-size)) 0 0;\n}\n\n.lh-gauge {\n  stroke-linecap: round;\n  width: var(--gauge-circle-size);\n  height: var(--gauge-circle-size);\n}\n\n.lh-category .lh-gauge {\n  --gauge-circle-size: var(--gauge-circle-size-big);\n}\n\n.lh-gauge-base {\n  opacity: 0.1;\n}\n\n.lh-gauge-arc {\n  fill: none;\n  transform-origin: 50% 50%;\n  animation: load-gauge var(--transition-length) ease forwards;\n  animation-delay: 250ms;\n}\n\n.lh-gauge__svg-wrapper {\n  position: relative;\n  height: var(--gauge-circle-size);\n}\n.lh-category .lh-gauge__svg-wrapper,\n.lh-category .lh-fraction__wrapper {\n  --gauge-circle-size: var(--gauge-circle-size-big);\n}\n\n/* The plugin badge overlay */\n.lh-gauge__wrapper--plugin .lh-gauge__svg-wrapper::before {\n  width: var(--plugin-badge-size);\n  height: var(--plugin-badge-size);\n  background-color: var(--plugin-badge-background-color);\n  background-image: var(--plugin-icon-url);\n  background-repeat: no-repeat;\n  background-size: var(--plugin-icon-size);\n  background-position: 58% 50%;\n  content: "";\n  position: absolute;\n  right: -6px;\n  bottom: 0px;\n  display: block;\n  z-index: 100;\n  box-shadow: 0 0 4px rgba(0,0,0,.2);\n  border-radius: 25%;\n}\n.lh-category .lh-gauge__wrapper--plugin .lh-gauge__svg-wrapper::before {\n  width: var(--plugin-badge-size-big);\n  height: var(--plugin-badge-size-big);\n}\n\n@keyframes load-gauge {\n  from { stroke-dasharray: 0 352; }\n}\n\n.lh-gauge__percentage {\n  width: 100%;\n  height: var(--gauge-circle-size);\n  position: absolute;\n  font-family: var(--report-font-family-monospace);\n  font-size: calc(var(--gauge-circle-size) * 0.34 + 1.3px);\n  line-height: 0;\n  text-align: center;\n  top: calc(var(--score-container-padding) + var(--gauge-circle-size) / 2);\n}\n\n.lh-category .lh-gauge__percentage {\n  --gauge-circle-size: var(--gauge-circle-size-big);\n  --gauge-percentage-font-size: var(--gauge-percentage-font-size-big);\n}\n\n.lh-gauge__wrapper,\n.lh-fraction__wrapper {\n  position: relative;\n  display: flex;\n  align-items: center;\n  flex-direction: column;\n  text-decoration: none;\n  padding: var(--score-container-padding);\n\n  --transition-length: 1s;\n\n  /* Contain the layout style paint & layers during animation*/\n  contain: content;\n  will-change: opacity; /* Only using for layer promotion */\n}\n\n.lh-gauge__label,\n.lh-fraction__label {\n  font-size: var(--gauge-label-font-size);\n  font-weight: 500;\n  line-height: var(--gauge-label-line-height);\n  margin-top: 10px;\n  text-align: center;\n  color: var(--report-text-color);\n  word-break: keep-all;\n}\n\n/* TODO(#8185) use more BEM (.lh-gauge__label--big) instead of relying on descendant selector */\n.lh-category .lh-gauge__label,\n.lh-category .lh-fraction__label {\n  --gauge-label-font-size: var(--gauge-label-font-size-big);\n  --gauge-label-line-height: var(--gauge-label-line-height-big);\n  margin-top: 14px;\n}\n\n.lh-scores-header .lh-gauge__wrapper,\n.lh-scores-header .lh-fraction__wrapper,\n.lh-scores-header .lh-gauge--pwa__wrapper,\n.lh-sticky-header .lh-gauge__wrapper,\n.lh-sticky-header .lh-fraction__wrapper,\n.lh-sticky-header .lh-gauge--pwa__wrapper {\n  width: var(--gauge-wrapper-width);\n}\n\n.lh-scorescale {\n  display: inline-flex;\n\n  gap: calc(var(--default-padding) * 4);\n  margin: 16px auto 0 auto;\n  font-size: var(--report-font-size-secondary);\n  color: var(--color-gray-700);\n\n}\n\n.lh-scorescale-range {\n  display: flex;\n  align-items: center;\n  font-family: var(--report-font-family-monospace);\n  white-space: nowrap;\n}\n\n.lh-category-header__finalscreenshot .lh-scorescale {\n  border: 0;\n  display: flex;\n  justify-content: center;\n}\n\n.lh-category-header__finalscreenshot .lh-scorescale-range {\n  font-family: unset;\n  font-size: 12px;\n}\n\n.lh-scorescale-wrap {\n  display: contents;\n}\n\n/* Hide category score gauages if it\'s a single category report */\n.lh-header--solo-category .lh-scores-wrapper {\n  display: none;\n}\n\n\n.lh-categories {\n  width: 100%;\n  overflow: hidden;\n}\n\n.lh-category {\n  padding: var(--category-padding);\n  max-width: var(--report-content-max-width);\n  margin: 0 auto;\n\n  --sticky-header-height: calc(var(--gauge-circle-size-sm) + var(--score-container-padding) * 2);\n  --topbar-plus-sticky-header: calc(var(--topbar-height) + var(--sticky-header-height));\n  scroll-margin-top: var(--topbar-plus-sticky-header);\n\n  /* Faster recalc style & layout of the report. https://web.dev/content-visibility/ */\n  content-visibility: auto;\n  contain-intrinsic-size: 1000px;\n}\n\n.lh-category-wrapper {\n  border-bottom: 1px solid var(--color-gray-200);\n}\n\n.lh-category-header {\n  margin-bottom: var(--section-padding-vertical);\n}\n\n.lh-category-header .lh-score__gauge {\n  max-width: 400px;\n  width: auto;\n  margin: 0px auto;\n}\n\n.lh-category-header__finalscreenshot {\n  display: grid;\n  grid-template: none / 1fr 1px 1fr;\n  justify-items: center;\n  align-items: center;\n  gap: var(--report-line-height);\n  min-height: 288px;\n  margin-bottom: var(--default-padding);\n}\n\n.lh-final-ss-image {\n  /* constrain the size of the image to not be too large */\n  max-height: calc(var(--gauge-circle-size-big) * 2.8);\n  max-width: calc(var(--gauge-circle-size-big) * 3.5);\n  border: 1px solid var(--color-gray-200);\n  padding: 4px;\n  border-radius: 3px;\n  display: block;\n}\n\n.lh-category-headercol--separator {\n  background: var(--color-gray-200);\n  width: 1px;\n  height: var(--gauge-circle-size-big);\n}\n\n@media screen and (max-width: 780px) {\n  .lh-category-header__finalscreenshot {\n    grid-template: 1fr 1fr / none\n  }\n  .lh-category-headercol--separator {\n    display: none;\n  }\n}\n\n\n/* 964 fits the min-width of the filmstrip */\n@media screen and (max-width: 964px) {\n  .lh-report {\n    margin-left: 0;\n    width: 100%;\n  }\n}\n\n@media print {\n  body {\n    -webkit-print-color-adjust: exact; /* print background colors */\n  }\n  .lh-container {\n    display: block;\n  }\n  .lh-report {\n    margin-left: 0;\n    padding-top: 0;\n  }\n  .lh-categories {\n    margin-top: 0;\n  }\n}\n\n.lh-table {\n  border-collapse: collapse;\n  /* Can\'t assign padding to table, so shorten the width instead. */\n  width: calc(100% - var(--audit-description-padding-left) - var(--stackpack-padding-horizontal));\n  border: 1px solid var(--report-border-color-secondary);\n\n}\n\n.lh-table thead th {\n  font-weight: normal;\n  color: var(--color-gray-600);\n  /* See text-wrapping comment on .lh-container. */\n  word-break: normal;\n}\n\n.lh-row--even {\n  background-color: var(--table-higlight-background-color);\n}\n.lh-row--hidden {\n  display: none;\n}\n\n.lh-table th,\n.lh-table td {\n  padding: var(--default-padding);\n}\n\n.lh-table tr {\n  vertical-align: middle;\n}\n\n/* Looks unnecessary, but mostly for keeping the <th>s left-aligned */\n.lh-table-column--text,\n.lh-table-column--source-location,\n.lh-table-column--url,\n/* .lh-table-column--thumbnail, */\n/* .lh-table-column--empty,*/\n.lh-table-column--code,\n.lh-table-column--node {\n  text-align: left;\n}\n\n.lh-table-column--code {\n  min-width: 100px;\n}\n\n.lh-table-column--bytes,\n.lh-table-column--timespanMs,\n.lh-table-column--ms,\n.lh-table-column--numeric {\n  text-align: right;\n  word-break: normal;\n}\n\n\n\n.lh-table .lh-table-column--thumbnail {\n  width: var(--image-preview-size);\n}\n\n.lh-table-column--url {\n  min-width: 250px;\n}\n\n.lh-table-column--text {\n  min-width: 80px;\n}\n\n/* Keep columns narrow if they follow the URL column */\n/* 12% was determined to be a decent narrow width, but wide enough for column headings */\n.lh-table-column--url + th.lh-table-column--bytes,\n.lh-table-column--url + .lh-table-column--bytes + th.lh-table-column--bytes,\n.lh-table-column--url + .lh-table-column--ms,\n.lh-table-column--url + .lh-table-column--ms + th.lh-table-column--bytes,\n.lh-table-column--url + .lh-table-column--bytes + th.lh-table-column--timespanMs {\n  width: 12%;\n}\n\n.lh-text__url-host {\n  display: inline;\n}\n\n.lh-text__url-host {\n  margin-left: calc(var(--report-font-size) / 2);\n  opacity: 0.6;\n  font-size: 90%\n}\n\n.lh-thumbnail {\n  object-fit: cover;\n  width: var(--image-preview-size);\n  height: var(--image-preview-size);\n  display: block;\n}\n\n.lh-unknown pre {\n  overflow: scroll;\n  border: solid 1px var(--color-gray-200);\n}\n\n.lh-text__url > a {\n  color: inherit;\n  text-decoration: none;\n}\n\n.lh-text__url > a:hover {\n  text-decoration: underline dotted #999;\n}\n\n.lh-sub-item-row {\n  margin-left: 20px;\n  margin-bottom: 0;\n  color: var(--color-gray-700);\n}\n.lh-sub-item-row td {\n  padding-top: 4px;\n  padding-bottom: 4px;\n  padding-left: 20px;\n}\n\n/* Chevron\n   https://codepen.io/paulirish/pen/LmzEmK\n */\n.lh-chevron {\n  --chevron-angle: 42deg;\n  /* Edge doesn\'t support transform: rotate(calc(...)), so we define it here */\n  --chevron-angle-right: -42deg;\n  width: var(--chevron-size);\n  height: var(--chevron-size);\n  margin-top: calc((var(--report-line-height) - 12px) / 2);\n}\n\n.lh-chevron__lines {\n  transition: transform 0.4s;\n  transform: translateY(var(--report-line-height));\n}\n.lh-chevron__line {\n stroke: var(--chevron-line-stroke);\n stroke-width: var(--chevron-size);\n stroke-linecap: square;\n transform-origin: 50%;\n transform: rotate(var(--chevron-angle));\n transition: transform 300ms, stroke 300ms;\n}\n\n.lh-expandable-details .lh-chevron__line-right,\n.lh-expandable-details[open] .lh-chevron__line-left {\n transform: rotate(var(--chevron-angle-right));\n}\n\n.lh-expandable-details[open] .lh-chevron__line-right {\n  transform: rotate(var(--chevron-angle));\n}\n\n\n.lh-expandable-details[open]  .lh-chevron__lines {\n transform: translateY(calc(var(--chevron-size) * -1));\n}\n\n.lh-expandable-details[open] {\n  animation: 300ms openDetails forwards;\n  padding-bottom: var(--default-padding);\n}\n\n@keyframes openDetails {\n  from {\n    outline: 1px solid var(--report-background-color);\n  }\n  to {\n   outline: 1px solid;\n   box-shadow: 0 2px 4px rgba(0, 0, 0, .24);\n  }\n}\n\n@media screen and (max-width: 780px) {\n  /* no black outline if we\'re not confident the entire table can be displayed within bounds */\n  .lh-expandable-details[open] {\n    animation: none;\n  }\n}\n\n.lh-expandable-details[open] summary, details.lh-clump > summary {\n  border-bottom: 1px solid var(--report-border-color-secondary);\n}\ndetails.lh-clump[open] > summary {\n  border-bottom-width: 0;\n}\n\n\n\ndetails .lh-clump-toggletext--hide,\ndetails[open] .lh-clump-toggletext--show { display: none; }\ndetails[open] .lh-clump-toggletext--hide { display: block;}\n\n\n/* Tooltip */\n.lh-tooltip-boundary {\n  position: relative;\n}\n\n.lh-tooltip {\n  position: absolute;\n  display: none; /* Don\'t retain these layers when not needed */\n  opacity: 0;\n  background: #ffffff;\n  white-space: pre-line; /* Render newlines in the text */\n  min-width: 246px;\n  max-width: 275px;\n  padding: 15px;\n  border-radius: 5px;\n  text-align: initial;\n  line-height: 1.4;\n}\n/* shrink tooltips to not be cutoff on left edge of narrow viewports\n   45vw is chosen to be ~= width of the left column of metrics\n*/\n@media screen and (max-width: 535px) {\n  .lh-tooltip {\n    min-width: 45vw;\n    padding: 3vw;\n  }\n}\n\n.lh-tooltip-boundary:hover .lh-tooltip {\n  display: block;\n  animation: fadeInTooltip 250ms;\n  animation-fill-mode: forwards;\n  animation-delay: 850ms;\n  bottom: 100%;\n  z-index: 1;\n  will-change: opacity;\n  right: 0;\n  pointer-events: none;\n}\n\n.lh-tooltip::before {\n  content: "";\n  border: solid transparent;\n  border-bottom-color: #fff;\n  border-width: 10px;\n  position: absolute;\n  bottom: -20px;\n  right: 6px;\n  transform: rotate(180deg);\n  pointer-events: none;\n}\n\n@keyframes fadeInTooltip {\n  0% { opacity: 0; }\n  75% { opacity: 1; }\n  100% { opacity: 1;  filter: drop-shadow(1px 0px 1px #aaa) drop-shadow(0px 2px 4px hsla(206, 6%, 25%, 0.15)); pointer-events: auto; }\n}\n\n/* Element screenshot */\n.lh-element-screenshot {\n  position: relative;\n  overflow: hidden;\n  float: left;\n  margin-right: 20px;\n}\n.lh-element-screenshot__content {\n  overflow: hidden;\n}\n.lh-element-screenshot__image {\n  /* Set by ElementScreenshotRenderer.installFullPageScreenshotCssVariable */\n  background-image: var(--element-screenshot-url);\n  outline: 2px solid #777;\n  background-color: white;\n  background-repeat: no-repeat;\n}\n.lh-element-screenshot__mask {\n  position: absolute;\n  background: #555;\n  opacity: 0.8;\n}\n.lh-element-screenshot__element-marker {\n  position: absolute;\n  outline: 2px solid var(--color-lime-400);\n}\n.lh-element-screenshot__overlay {\n  position: fixed;\n  top: 0;\n  left: 0;\n  right: 0;\n  bottom: 0;\n  z-index: 2000; /* .lh-topbar is 1000 */\n  background: var(--screenshot-overlay-background);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  cursor: zoom-out;\n}\n\n.lh-element-screenshot__overlay .lh-element-screenshot {\n  margin-right: 0; /* clearing margin used in thumbnail case */\n  outline: 1px solid var(--color-gray-700);\n}\n\n.lh-screenshot-overlay--enabled .lh-element-screenshot {\n  cursor: zoom-out;\n}\n.lh-screenshot-overlay--enabled .lh-node .lh-element-screenshot {\n  cursor: zoom-in;\n}\n\n\n.lh-meta__items {\n  --meta-icon-size: calc(var(--report-icon-size) * 0.667);\n  padding: var(--default-padding);\n  display: grid;\n  grid-template-columns: 1fr 1fr 1fr;\n  background-color: var(--env-item-background-color);\n  border-radius: 3px;\n  margin: 0 0 var(--default-padding) 0;\n  font-size: 12px;\n  column-gap: var(--default-padding);\n  color: var(--color-gray-700);\n}\n\n.lh-meta__item {\n  display: block;\n  list-style-type: none;\n  position: relative;\n  padding: 0 0 0 calc(var(--meta-icon-size) + var(--default-padding) * 2);\n  cursor: unset; /* disable pointer cursor from report-icon */\n}\n\n.lh-meta__item.lh-tooltip-boundary {\n  text-decoration: dotted underline var(--color-gray-500);\n  cursor: help;\n}\n\n.lh-meta__item.lh-report-icon::before {\n  position: absolute;\n  left: var(--default-padding);\n  width: var(--meta-icon-size);\n  height: var(--meta-icon-size);\n}\n\n.lh-meta__item.lh-report-icon:hover::before {\n  opacity: 0.7;\n}\n\n.lh-meta__item .lh-tooltip {\n  color: var(--color-gray-800);\n}\n\n.lh-meta__item .lh-tooltip::before {\n  right: auto; /* Set the tooltip arrow to the leftside */\n  left: 6px;\n}\n\n/* Change the grid for narrow viewport. */\n@media screen and (max-width: 640px) {\n  .lh-meta__items {\n    grid-template-columns: 1fr 1fr;\n  }\n}\n@media screen and (max-width: 535px) {\n  .lh-meta__items {\n    display: block;\n  }\n}\n\n\n/*# sourceURL=report-styles.css */\n');
  el0.append(el1);
  return el0;
}

/**
 * @param {DOM} dom
 */
function createTopbarComponent(dom) {
  const el0 = dom.createFragment();
  const el1 = dom.createElement('style');
  el1.append('\n    .lh-topbar {\n      position: sticky;\n      top: 0;\n      left: 0;\n      right: 0;\n      z-index: 1000;\n      display: flex;\n      align-items: center;\n      height: var(--topbar-height);\n      padding: var(--topbar-padding);\n      font-size: var(--report-font-size-secondary);\n      background-color: var(--topbar-background-color);\n      border-bottom: 1px solid var(--color-gray-200);\n    }\n\n    .lh-topbar__logo {\n      width: var(--topbar-logo-size);\n      height: var(--topbar-logo-size);\n      user-select: none;\n      flex: none;\n    }\n\n    .lh-topbar__url {\n      margin: var(--topbar-padding);\n      text-decoration: none;\n      color: var(--report-text-color);\n      text-overflow: ellipsis;\n      overflow: hidden;\n      white-space: nowrap;\n    }\n\n    .lh-tools {\n      display: flex;\n      align-items: center;\n      margin-left: auto;\n      will-change: transform;\n      min-width: var(--report-icon-size);\n    }\n    .lh-tools__button {\n      width: var(--report-icon-size);\n      min-width: 24px;\n      height: var(--report-icon-size);\n      cursor: pointer;\n      margin-right: 5px;\n      /* This is actually a button element, but we want to style it like a transparent div. */\n      display: flex;\n      background: none;\n      color: inherit;\n      border: none;\n      padding: 0;\n      font: inherit;\n      outline: inherit;\n    }\n    .lh-tools__button svg {\n      fill: var(--tools-icon-color);\n    }\n    .lh-dark .lh-tools__button svg {\n      filter: invert(1);\n    }\n    .lh-tools__button.lh-active + .lh-tools__dropdown {\n      opacity: 1;\n      clip: rect(-1px, 194px, 242px, -3px);\n      visibility: visible;\n    }\n    .lh-tools__dropdown {\n      position: absolute;\n      background-color: var(--report-background-color);\n      border: 1px solid var(--report-border-color);\n      border-radius: 3px;\n      padding: calc(var(--default-padding) / 2) 0;\n      cursor: pointer;\n      top: 36px;\n      right: 0;\n      box-shadow: 1px 1px 3px #ccc;\n      min-width: 125px;\n      clip: rect(0, 164px, 0, 0);\n      visibility: hidden;\n      opacity: 0;\n      transition: all 200ms cubic-bezier(0,0,0.2,1);\n    }\n    .lh-tools__dropdown a {\n      color: currentColor;\n      text-decoration: none;\n      white-space: nowrap;\n      padding: 0 6px;\n      line-height: 2;\n    }\n    .lh-tools__dropdown a:hover,\n    .lh-tools__dropdown a:focus {\n      background-color: var(--color-gray-200);\n      outline: none;\n    }\n    /* save-gist option hidden in report. */\n    .lh-tools__dropdown a[data-action=\'save-gist\'] {\n      display: none;\n    }\n\n    .lh-locale-selector {\n      width: 100%;\n      color: var(--report-text-color);\n      background-color: var(--locale-selector-background-color);\n      padding: 2px;\n    }\n    .lh-tools-locale {\n      display: flex;\n      align-items: center;\n      flex-direction: row-reverse;\n    }\n    .lh-tools-locale__selector-wrapper {\n      transition: opacity 0.15s;\n      opacity: 0;\n      max-width: 200px;\n    }\n    .lh-button.lh-tool-locale__button {\n      height: var(--topbar-height);\n      color: var(--tools-icon-color);\n      padding: calc(var(--default-padding) / 2);\n    }\n    .lh-tool-locale__button.lh-active + .lh-tools-locale__selector-wrapper {\n      opacity: 1;\n      clip: rect(-1px, 194px, 242px, -3px);\n      visibility: visible;\n      margin: 0 4px;\n    }\n\n    @media screen and (max-width: 964px) {\n      .lh-tools__dropdown {\n        right: 0;\n        left: initial;\n      }\n    }\n    @media print {\n      .lh-topbar {\n        position: static;\n        margin-left: 0;\n      }\n\n      .lh-tools__dropdown {\n        display: none;\n      }\n    }\n  ');
  el0.append(el1);
  const el2 = dom.createElement('div', 'lh-topbar');
  const el3 = dom.createElementNS('http://www.w3.org/2000/svg', 'svg', 'lh-topbar__logo');
  el3.setAttribute('viewBox', '0 0 24 24');
  const el4 = dom.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const el5 = dom.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  el5.setAttribute('x1', '57.456%');
  el5.setAttribute('y1', '13.086%');
  el5.setAttribute('x2', '18.259%');
  el5.setAttribute('y2', '72.322%');
  el5.setAttribute('id', 'lh-topbar__logo--a');
  const el6 = dom.createElementNS('http://www.w3.org/2000/svg', 'stop');
  el6.setAttribute('stop-color', '#262626');
  el6.setAttribute('stop-opacity', '.1');
  el6.setAttribute('offset', '0%');
  const el7 = dom.createElementNS('http://www.w3.org/2000/svg', 'stop');
  el7.setAttribute('stop-color', '#262626');
  el7.setAttribute('stop-opacity', '0');
  el7.setAttribute('offset', '100%');
  el5.append(' ', el6, ' ', el7, ' ');
  const el8 = dom.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  el8.setAttribute('x1', '100%');
  el8.setAttribute('y1', '50%');
  el8.setAttribute('x2', '0%');
  el8.setAttribute('y2', '50%');
  el8.setAttribute('id', 'lh-topbar__logo--b');
  const el9 = dom.createElementNS('http://www.w3.org/2000/svg', 'stop');
  el9.setAttribute('stop-color', '#262626');
  el9.setAttribute('stop-opacity', '.1');
  el9.setAttribute('offset', '0%');
  const el10 = dom.createElementNS('http://www.w3.org/2000/svg', 'stop');
  el10.setAttribute('stop-color', '#262626');
  el10.setAttribute('stop-opacity', '0');
  el10.setAttribute('offset', '100%');
  el8.append(' ', el9, ' ', el10, ' ');
  const el11 = dom.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  el11.setAttribute('x1', '58.764%');
  el11.setAttribute('y1', '65.756%');
  el11.setAttribute('x2', '36.939%');
  el11.setAttribute('y2', '50.14%');
  el11.setAttribute('id', 'lh-topbar__logo--c');
  const el12 = dom.createElementNS('http://www.w3.org/2000/svg', 'stop');
  el12.setAttribute('stop-color', '#262626');
  el12.setAttribute('stop-opacity', '.1');
  el12.setAttribute('offset', '0%');
  const el13 = dom.createElementNS('http://www.w3.org/2000/svg', 'stop');
  el13.setAttribute('stop-color', '#262626');
  el13.setAttribute('stop-opacity', '0');
  el13.setAttribute('offset', '100%');
  el11.append(' ', el12, ' ', el13, ' ');
  const el14 = dom.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  el14.setAttribute('x1', '41.635%');
  el14.setAttribute('y1', '20.358%');
  el14.setAttribute('x2', '72.863%');
  el14.setAttribute('y2', '85.424%');
  el14.setAttribute('id', 'lh-topbar__logo--d');
  const el15 = dom.createElementNS('http://www.w3.org/2000/svg', 'stop');
  el15.setAttribute('stop-color', '#FFF');
  el15.setAttribute('stop-opacity', '.1');
  el15.setAttribute('offset', '0%');
  const el16 = dom.createElementNS('http://www.w3.org/2000/svg', 'stop');
  el16.setAttribute('stop-color', '#FFF');
  el16.setAttribute('stop-opacity', '0');
  el16.setAttribute('offset', '100%');
  el14.append(' ', el15, ' ', el16, ' ');
  el4.append(' ', el5, ' ', el8, ' ', el11, ' ', el14, ' ');
  const el17 = dom.createElementNS('http://www.w3.org/2000/svg', 'g');
  el17.setAttribute('fill', 'none');
  el17.setAttribute('fill-rule', 'evenodd');
  const el18 = dom.createElementNS('http://www.w3.org/2000/svg', 'path');
  el18.setAttribute('d', 'M12 3l4.125 2.625v3.75H18v2.25h-1.688l1.5 9.375H6.188l1.5-9.375H6v-2.25h1.875V5.648L12 3zm2.201 9.938L9.54 14.633 9 18.028l5.625-2.062-.424-3.028zM12.005 5.67l-1.88 1.207v2.498h3.75V6.86l-1.87-1.19z');
  el18.setAttribute('fill', '#F44B21');
  const el19 = dom.createElementNS('http://www.w3.org/2000/svg', 'path');
  el19.setAttribute('fill', '#FFF');
  el19.setAttribute('d', 'M14.201 12.938L9.54 14.633 9 18.028l5.625-2.062z');
  const el20 = dom.createElementNS('http://www.w3.org/2000/svg', 'path');
  el20.setAttribute('d', 'M6 18c-2.042 0-3.95-.01-5.813 0l1.5-9.375h4.326L6 18z');
  el20.setAttribute('fill', 'url(#lh-topbar__logo--a)');
  el20.setAttribute('fill-rule', 'nonzero');
  el20.setAttribute('transform', 'translate(6 3)');
  const el21 = dom.createElementNS('http://www.w3.org/2000/svg', 'path');
  el21.setAttribute('fill', '#FFF176');
  el21.setAttribute('fill-rule', 'nonzero');
  el21.setAttribute('d', 'M13.875 9.375v-2.56l-1.87-1.19-1.88 1.207v2.543z');
  const el22 = dom.createElementNS('http://www.w3.org/2000/svg', 'path');
  el22.setAttribute('fill', 'url(#lh-topbar__logo--b)');
  el22.setAttribute('fill-rule', 'nonzero');
  el22.setAttribute('d', 'M0 6.375h6v2.25H0z');
  el22.setAttribute('transform', 'translate(6 3)');
  const el23 = dom.createElementNS('http://www.w3.org/2000/svg', 'path');
  el23.setAttribute('fill', 'url(#lh-topbar__logo--c)');
  el23.setAttribute('fill-rule', 'nonzero');
  el23.setAttribute('d', 'M6 6.375H1.875v-3.75L6 0z');
  el23.setAttribute('transform', 'translate(6 3)');
  const el24 = dom.createElementNS('http://www.w3.org/2000/svg', 'path');
  el24.setAttribute('fill', 'url(#lh-topbar__logo--d)');
  el24.setAttribute('fill-rule', 'nonzero');
  el24.setAttribute('d', 'M6 0l4.125 2.625v3.75H12v2.25h-1.688l1.5 9.375H.188l1.5-9.375H0v-2.25h1.875V2.648z');
  el24.setAttribute('transform', 'translate(6 3)');
  el17.append(' ', el18, ' ', el19, ' ', el20, ' ', el21, ' ', el22, ' ', el23, ' ', el24, ' ');
  el3.append(' ', el4, ' ', el17, ' ');
  const el25 = dom.createElement('a', 'lh-topbar__url');
  el25.setAttribute('href', '');
  el25.setAttribute('target', '_blank');
  el25.setAttribute('rel', 'noopener');
  const el26 = dom.createElement('div', 'lh-tools');
  const el27 = dom.createElement('div', 'lh-tools-locale lh-hidden');
  const el28 = dom.createElement('button', 'lh-button lh-tool-locale__button');
  el28.setAttribute('id', 'lh-button__swap-locales');
  el28.setAttribute('title', 'Show Language Picker');
  el28.setAttribute('aria-label', 'Toggle language picker');
  el28.setAttribute('aria-haspopup', 'menu');
  el28.setAttribute('aria-expanded', 'false');
  el28.setAttribute('aria-controls', 'lh-tools-locale__selector-wrapper');
  const el29 = dom.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el29.setAttribute('width', '20px');
  el29.setAttribute('height', '20px');
  el29.setAttribute('viewBox', '0 0 24 24');
  el29.setAttribute('fill', 'currentColor');
  const el30 = dom.createElementNS('http://www.w3.org/2000/svg', 'path');
  el30.setAttribute('d', 'M0 0h24v24H0V0z');
  el30.setAttribute('fill', 'none');
  const el31 = dom.createElementNS('http://www.w3.org/2000/svg', 'path');
  el31.setAttribute('d', 'M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z');
  el29.append(el30, el31);
  el28.append(' ', el29, ' ');
  const el32 = dom.createElement('div', 'lh-tools-locale__selector-wrapper');
  el32.setAttribute('id', 'lh-tools-locale__selector-wrapper');
  el32.setAttribute('role', 'menu');
  el32.setAttribute('aria-labelledby', 'lh-button__swap-locales');
  el32.setAttribute('aria-hidden', 'true');
  el32.append(' ', ' ');
  el27.append(' ', el28, ' ', el32, ' ');
  const el33 = dom.createElement('button', 'lh-tools__button');
  el33.setAttribute('id', 'lh-tools-button');
  el33.setAttribute('title', 'Tools menu');
  el33.setAttribute('aria-label', 'Toggle report tools menu');
  el33.setAttribute('aria-haspopup', 'menu');
  el33.setAttribute('aria-expanded', 'false');
  el33.setAttribute('aria-controls', 'lh-tools-dropdown');
  const el34 = dom.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el34.setAttribute('width', '100%');
  el34.setAttribute('height', '100%');
  el34.setAttribute('viewBox', '0 0 24 24');
  const el35 = dom.createElementNS('http://www.w3.org/2000/svg', 'path');
  el35.setAttribute('d', 'M0 0h24v24H0z');
  el35.setAttribute('fill', 'none');
  const el36 = dom.createElementNS('http://www.w3.org/2000/svg', 'path');
  el36.setAttribute('d', 'M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z');
  el34.append(' ', el35, ' ', el36, ' ');
  el33.append(' ', el34, ' ');
  const el37 = dom.createElement('div', 'lh-tools__dropdown');
  el37.setAttribute('id', 'lh-tools-dropdown');
  el37.setAttribute('role', 'menu');
  el37.setAttribute('aria-labelledby', 'lh-tools-button');
  const el38 = dom.createElement('a', 'lh-report-icon lh-report-icon--print');
  el38.setAttribute('role', 'menuitem');
  el38.setAttribute('tabindex', '-1');
  el38.setAttribute('href', '#');
  el38.setAttribute('data-i18n', 'dropdownPrintSummary');
  el38.setAttribute('data-action', 'print-summary');
  const el39 = dom.createElement('a', 'lh-report-icon lh-report-icon--print');
  el39.setAttribute('role', 'menuitem');
  el39.setAttribute('tabindex', '-1');
  el39.setAttribute('href', '#');
  el39.setAttribute('data-i18n', 'dropdownPrintExpanded');
  el39.setAttribute('data-action', 'print-expanded');
  const el40 = dom.createElement('a', 'lh-report-icon lh-report-icon--copy');
  el40.setAttribute('role', 'menuitem');
  el40.setAttribute('tabindex', '-1');
  el40.setAttribute('href', '#');
  el40.setAttribute('data-i18n', 'dropdownCopyJSON');
  el40.setAttribute('data-action', 'copy');
  const el41 = dom.createElement('a', 'lh-report-icon lh-report-icon--download lh-hidden');
  el41.setAttribute('role', 'menuitem');
  el41.setAttribute('tabindex', '-1');
  el41.setAttribute('href', '#');
  el41.setAttribute('data-i18n', 'dropdownSaveHTML');
  el41.setAttribute('data-action', 'save-html');
  const el42 = dom.createElement('a', 'lh-report-icon lh-report-icon--download');
  el42.setAttribute('role', 'menuitem');
  el42.setAttribute('tabindex', '-1');
  el42.setAttribute('href', '#');
  el42.setAttribute('data-i18n', 'dropdownSaveJSON');
  el42.setAttribute('data-action', 'save-json');
  const el43 = dom.createElement('a', 'lh-report-icon lh-report-icon--open');
  el43.setAttribute('role', 'menuitem');
  el43.setAttribute('tabindex', '-1');
  el43.setAttribute('href', '#');
  el43.setAttribute('data-i18n', 'dropdownViewer');
  el43.setAttribute('data-action', 'open-viewer');
  const el44 = dom.createElement('a', 'lh-report-icon lh-report-icon--open');
  el44.setAttribute('role', 'menuitem');
  el44.setAttribute('tabindex', '-1');
  el44.setAttribute('href', '#');
  el44.setAttribute('data-i18n', 'dropdownSaveGist');
  el44.setAttribute('data-action', 'save-gist');
  const el45 = dom.createElement('a', 'lh-report-icon lh-report-icon--dark');
  el45.setAttribute('role', 'menuitem');
  el45.setAttribute('tabindex', '-1');
  el45.setAttribute('href', '#');
  el45.setAttribute('data-i18n', 'dropdownDarkTheme');
  el45.setAttribute('data-action', 'toggle-dark');
  el37.append(' ', el38, ' ', el39, ' ', el40, ' ', ' ', el41, ' ', el42, ' ', el43, ' ', el44, ' ', el45, ' ');
  el26.append(' ', el27, ' ', el33, ' ', el37, ' ');
  el2.append(' ', ' ', el3, ' ', el25, ' ', el26, ' ');
  el0.append(el2);
  return el0;
}

/**
 * @param {DOM} dom
 */
function createWarningsToplevelComponent(dom) {
  const el0 = dom.createFragment();
  const el1 = dom.createElement('div', 'lh-warnings lh-warnings--toplevel');
  const el2 = dom.createElement('p', 'lh-warnings__msg');
  const el3 = dom.createElement('ul');
  el1.append(' ', el2, ' ', el3, ' ');
  el0.append(el1);
  return el0;
}


/** @typedef {'3pFilter'|'audit'|'categoryHeader'|'chevron'|'clump'|'crc'|'crcChain'|'elementScreenshot'|'footer'|'fraction'|'gauge'|'gaugePwa'|'heading'|'metric'|'opportunity'|'opportunityHeader'|'scorescale'|'scoresWrapper'|'snippet'|'snippetContent'|'snippetHeader'|'snippetLine'|'styles'|'topbar'|'warningsToplevel'} ComponentName */
/**
 * @param {DOM} dom
 * @param {ComponentName} componentName
 * @return {DocumentFragment}
 */
function createComponent(dom, componentName) {
  switch (componentName) {
    case '3pFilter': return create3pFilterComponent(dom);
    case 'audit': return createAuditComponent(dom);
    case 'categoryHeader': return createCategoryHeaderComponent(dom);
    case 'chevron': return createChevronComponent(dom);
    case 'clump': return createClumpComponent(dom);
    case 'crc': return createCrcComponent(dom);
    case 'crcChain': return createCrcChainComponent(dom);
    case 'elementScreenshot': return createElementScreenshotComponent(dom);
    case 'footer': return createFooterComponent(dom);
    case 'fraction': return createFractionComponent(dom);
    case 'gauge': return createGaugeComponent(dom);
    case 'gaugePwa': return createGaugePwaComponent(dom);
    case 'heading': return createHeadingComponent(dom);
    case 'metric': return createMetricComponent(dom);
    case 'opportunity': return createOpportunityComponent(dom);
    case 'opportunityHeader': return createOpportunityHeaderComponent(dom);
    case 'scorescale': return createScorescaleComponent(dom);
    case 'scoresWrapper': return createScoresWrapperComponent(dom);
    case 'snippet': return createSnippetComponent(dom);
    case 'snippetContent': return createSnippetContentComponent(dom);
    case 'snippetHeader': return createSnippetHeaderComponent(dom);
    case 'snippetLine': return createSnippetLineComponent(dom);
    case 'styles': return createStylesComponent(dom);
    case 'topbar': return createTopbarComponent(dom);
    case 'warningsToplevel': return createWarningsToplevelComponent(dom);
  }
  throw new Error('unexpected component: ' + componentName);
}

/**
 * @license
 * Copyright 2017 The Lighthouse Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

class DOM {
  /**
   * @param {Document} document
   * @param {HTMLElement} rootEl
   */
  constructor(document, rootEl) {
    /** @type {Document} */
    this._document = document;
    /** @type {string} */
    this._lighthouseChannel = 'unknown';
    /** @type {Map<string, DocumentFragment>} */
    this._componentCache = new Map();
    /** @type {HTMLElement} */
    // For legacy Report API users, this'll be undefined, but set in renderReport
    this.rootEl = rootEl;
  }

  /**
   * @template {string} T
   * @param {T} name
   * @param {string=} className
   * @return {HTMLElementByTagName[T]}
   */
  createElement(name, className) {
    const element = this._document.createElement(name);
    if (className) {
      for (const token of className.split(/\s+/)) {
        if (token) element.classList.add(token);
      }
    }
    return element;
  }

  /**
   * @param {string} namespaceURI
   * @param {string} name
   * @param {string=} className
   * @return {Element}
   */
  createElementNS(namespaceURI, name, className) {
    const element = this._document.createElementNS(namespaceURI, name);
    if (className) {
      for (const token of className.split(/\s+/)) {
        if (token) element.classList.add(token);
      }
    }
    return element;
  }

  /**
   * @return {!DocumentFragment}
   */
  createFragment() {
    return this._document.createDocumentFragment();
  }

  /**
   * @param {string} data
   * @return {!Node}
   */
  createTextNode(data) {
    return this._document.createTextNode(data);
  }


  /**
   * @template {string} T
   * @param {Element} parentElem
   * @param {T} elementName
   * @param {string=} className
   * @return {HTMLElementByTagName[T]}
   */
  createChildOf(parentElem, elementName, className) {
    const element = this.createElement(elementName, className);
    parentElem.appendChild(element);
    return element;
  }

  /**
   * @param {import('./components.js').ComponentName} componentName
   * @return {!DocumentFragment} A clone of the cached component.
   */
  createComponent(componentName) {
    let component = this._componentCache.get(componentName);
    if (component) {
      const cloned = /** @type {DocumentFragment} */ (component.cloneNode(true));
      // Prevent duplicate styles in the DOM. After a template has been stamped
      // for the first time, remove the clone's styles so they're not re-added.
      this.findAll('style', cloned).forEach(style => style.remove());
      return cloned;
    }

    component = createComponent(this, componentName);
    this._componentCache.set(componentName, component);
    const cloned = /** @type {DocumentFragment} */ (component.cloneNode(true));
    return cloned;
  }

  clearComponentCache() {
    this._componentCache.clear();
  }

  /**
   * @param {string} text
   * @return {Element}
   */
  convertMarkdownLinkSnippets(text) {
    const element = this.createElement('span');

    for (const segment of Util.splitMarkdownLink(text)) {
      if (!segment.isLink) {
        // Plain text segment.
        element.appendChild(this._document.createTextNode(segment.text));
        continue;
      }

      // Otherwise, append any links found.
      const url = new URL(segment.linkHref);

      const DOCS_ORIGINS = ['https://developers.google.com', 'https://web.dev'];
      if (DOCS_ORIGINS.includes(url.origin)) {
        url.searchParams.set('utm_source', 'lighthouse');
        url.searchParams.set('utm_medium', this._lighthouseChannel);
      }

      const a = this.createElement('a');
      a.rel = 'noopener';
      a.target = '_blank';
      a.textContent = segment.text;
      this.safelySetHref(a, url.href);
      element.appendChild(a);
    }

    return element;
  }

  /**
   * Set link href, but safely, preventing `javascript:` protocol, etc.
   * @see https://github.com/google/safevalues/
   * @param {HTMLAnchorElement} elem
   * @param {string} url
   */
  safelySetHref(elem, url) {
    // Defaults to '' to fix proto roundtrip issue. See https://github.com/GoogleChrome/lighthouse/issues/12868
    url = url || '';

    // In-page anchor links are safe.
    if (url.startsWith('#')) {
      elem.href = url;
      return;
    }

    const allowedProtocols = ['https:', 'http:'];
    let parsed;
    try {
      parsed = new URL(url);
    } catch (_) {}

    if (parsed && allowedProtocols.includes(parsed.protocol)) {
      elem.href = parsed.href;
    }
  }

  /**
   * Only create blob URLs for JSON & HTML
   * @param {HTMLAnchorElement} elem
   * @param {Blob} blob
   */
  safelySetBlobHref(elem, blob) {
    if (blob.type !== 'text/html' && blob.type !== 'application/json') {
      throw new Error('Unsupported blob type');
    }
    const href = URL.createObjectURL(blob);
    elem.href = href;
  }

  /**
   * @param {string} markdownText
   * @return {Element}
   */
  convertMarkdownCodeSnippets(markdownText) {
    const element = this.createElement('span');

    for (const segment of Util.splitMarkdownCodeSpans(markdownText)) {
      if (segment.isCode) {
        const pre = this.createElement('code');
        pre.textContent = segment.text;
        element.appendChild(pre);
      } else {
        element.appendChild(this._document.createTextNode(segment.text));
      }
    }

    return element;
  }

  /**
   * The channel to use for UTM data when rendering links to the documentation.
   * @param {string} lighthouseChannel
   */
  setLighthouseChannel(lighthouseChannel) {
    this._lighthouseChannel = lighthouseChannel;
  }

  /**
   * ONLY use if `dom.rootEl` isn't sufficient for your needs. `dom.rootEl` is preferred
   * for all scoping, because a document can have multiple reports within it.
   * @return {Document}
   */
  document() {
    return this._document;
  }

  /**
   * TODO(paulirish): import and conditionally apply the DevTools frontend subclasses instead of this
   * @return {boolean}
   */
  isDevTools() {
    return !!this._document.querySelector('.lh-devtools');
  }

  /**
   * Guaranteed context.querySelector. Always returns an element or throws if
   * nothing matches query.
   * @template {string} T
   * @param {T} query
   * @param {ParentNode} context
   * @return {ParseSelector<T>}
   */
  find(query, context) {
    const result = context.querySelector(query);
    if (result === null) {
      throw new Error(`query ${query} not found`);
    }

    // Because we control the report layout and templates, use the simpler
    // `typed-query-selector` types that don't require differentiating between
    // e.g. HTMLAnchorElement and SVGAElement. See https://github.com/GoogleChrome/lighthouse/issues/12011
    return /** @type {ParseSelector<T>} */ (result);
  }

  /**
   * Helper for context.querySelectorAll. Returns an Array instead of a NodeList.
   * @template {string} T
   * @param {T} query
   * @param {ParentNode} context
   */
  findAll(query, context) {
    const elements = Array.from(context.querySelectorAll(query));
    return elements;
  }

  /**
   * Fires a custom DOM event on target.
   * @param {string} name Name of the event.
   * @param {Node=} target DOM node to fire the event on.
   * @param {*=} detail Custom data to include.
   */
  fireEventOn(name, target = this._document, detail) {
    const event = new CustomEvent(name, detail ? {detail} : undefined);
    target.dispatchEvent(event);
  }

  /**
   * Downloads a file (blob) using a[download].
   * @param {Blob|File} blob The file to save.
   * @param {string} filename
   */
  saveFile(blob, filename) {
    const a = this.createElement('a');
    a.download = filename;
    this.safelySetBlobHref(a, blob);
    this._document.body.appendChild(a); // Firefox requires anchor to be in the DOM.
    a.click();

    // cleanup.
    this._document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 500);
  }
}

/**
 * @license
 * Copyright 2017 The Lighthouse Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

class CategoryRenderer {
  /**
   * @param {DOM} dom
   * @param {DetailsRenderer} detailsRenderer
   */
  constructor(dom, detailsRenderer) {
    /** @type {DOM} */
    this.dom = dom;
    /** @type {DetailsRenderer} */
    this.detailsRenderer = detailsRenderer;
  }

  /**
   * Display info per top-level clump. Define on class to avoid race with Util init.
   */
  get _clumpTitles() {
    return {
      warning: Util.i18n.strings.warningAuditsGroupTitle,
      manual: Util.i18n.strings.manualAuditsGroupTitle,
      passed: Util.i18n.strings.passedAuditsGroupTitle,
      notApplicable: Util.i18n.strings.notApplicableAuditsGroupTitle,
    };
  }

  /**
   * @param {LH.ReportResult.AuditRef} audit
   * @return {Element}
   */
  renderAudit(audit) {
    const component = this.dom.createComponent('audit');
    return this.populateAuditValues(audit, component);
  }

  /**
   * Populate an DOM tree with audit details. Used by renderAudit and renderOpportunity
   * @param {LH.ReportResult.AuditRef} audit
   * @param {DocumentFragment} component
   * @return {!Element}
   */
  populateAuditValues(audit, component) {
    const strings = Util.i18n.strings;
    const auditEl = this.dom.find('.lh-audit', component);
    auditEl.id = audit.result.id;
    const scoreDisplayMode = audit.result.scoreDisplayMode;

    if (audit.result.displayValue) {
      this.dom.find('.lh-audit__display-text', auditEl).textContent = audit.result.displayValue;
    }

    const titleEl = this.dom.find('.lh-audit__title', auditEl);
    titleEl.appendChild(this.dom.convertMarkdownCodeSnippets(audit.result.title));
    const descEl = this.dom.find('.lh-audit__description', auditEl);
    descEl.appendChild(this.dom.convertMarkdownLinkSnippets(audit.result.description));

    for (const relevantMetric of audit.relevantMetrics || []) {
      const adornEl = this.dom.createChildOf(descEl, 'span', 'lh-audit__adorn');
      adornEl.title = `Relevant to ${relevantMetric.result.title}`;
      adornEl.textContent = relevantMetric.acronym || relevantMetric.id;
    }

    if (audit.stackPacks) {
      audit.stackPacks.forEach(pack => {
        const packElm = this.dom.createElement('div');
        packElm.classList.add('lh-audit__stackpack');

        const packElmImg = this.dom.createElement('img');
        packElmImg.classList.add('lh-audit__stackpack__img');
        packElmImg.src = pack.iconDataURL;
        packElmImg.alt = pack.title;
        packElm.appendChild(packElmImg);

        packElm.appendChild(this.dom.convertMarkdownLinkSnippets(pack.description));

        this.dom.find('.lh-audit__stackpacks', auditEl)
          .appendChild(packElm);
      });
    }

    const header = this.dom.find('details', auditEl);
    if (audit.result.details) {
      const elem = this.detailsRenderer.render(audit.result.details);
      if (elem) {
        elem.classList.add('lh-details');
        header.appendChild(elem);
      }
    }

    // Add chevron SVG to the end of the summary
    this.dom.find('.lh-chevron-container', auditEl).appendChild(this._createChevron());
    this._setRatingClass(auditEl, audit.result.score, scoreDisplayMode);

    if (audit.result.scoreDisplayMode === 'error') {
      auditEl.classList.add(`lh-audit--error`);
      const textEl = this.dom.find('.lh-audit__display-text', auditEl);
      textEl.textContent = strings.errorLabel;
      textEl.classList.add('lh-tooltip-boundary');
      const tooltip = this.dom.createChildOf(textEl, 'div', 'lh-tooltip lh-tooltip--error');
      tooltip.textContent = audit.result.errorMessage || strings.errorMissingAuditInfo;
    } else if (audit.result.explanation) {
      const explEl = this.dom.createChildOf(titleEl, 'div', 'lh-audit-explanation');
      explEl.textContent = audit.result.explanation;
    }
    const warnings = audit.result.warnings;
    if (!warnings || warnings.length === 0) return auditEl;

    // Add list of warnings or singular warning
    const summaryEl = this.dom.find('summary', header);
    const warningsEl = this.dom.createChildOf(summaryEl, 'div', 'lh-warnings');
    this.dom.createChildOf(warningsEl, 'span').textContent = strings.warningHeader;
    if (warnings.length === 1) {
      warningsEl.appendChild(this.dom.createTextNode(warnings.join('')));
    } else {
      const warningsUl = this.dom.createChildOf(warningsEl, 'ul');
      for (const warning of warnings) {
        const item = this.dom.createChildOf(warningsUl, 'li');
        item.textContent = warning;
      }
    }
    return auditEl;
  }

  /**
   * Inject the final screenshot next to the score gauge of the first category (likely Performance)
   * @param {HTMLElement} categoriesEl
   * @param {LH.ReportResult['audits']} audits
   * @param {Element} scoreScaleEl
   */
  injectFinalScreenshot(categoriesEl, audits, scoreScaleEl) {
    const audit = audits['final-screenshot'];
    if (!audit || audit.scoreDisplayMode === 'error') return null;
    if (!audit.details || audit.details.type !== 'screenshot') return null;

    const imgEl = this.dom.createElement('img', 'lh-final-ss-image');
    const finalScreenshotDataUri = audit.details.data;
    imgEl.src = finalScreenshotDataUri;
    imgEl.alt = audit.title;

    const firstCatHeaderEl = this.dom.find('.lh-category .lh-category-header', categoriesEl);
    const leftColEl = this.dom.createElement('div', 'lh-category-headercol');
    const separatorEl = this.dom.createElement('div',
        'lh-category-headercol lh-category-headercol--separator');
    const rightColEl = this.dom.createElement('div', 'lh-category-headercol');

    leftColEl.append(...firstCatHeaderEl.childNodes);
    leftColEl.append(scoreScaleEl);
    rightColEl.append(imgEl);
    firstCatHeaderEl.append(leftColEl, separatorEl, rightColEl);
    firstCatHeaderEl.classList.add('lh-category-header__finalscreenshot');
  }

  /**
   * @return {Element}
   */
  _createChevron() {
    const component = this.dom.createComponent('chevron');
    const chevronEl = this.dom.find('svg.lh-chevron', component);
    return chevronEl;
  }

  /**
   * @param {Element} element DOM node to populate with values.
   * @param {number|null} score
   * @param {string} scoreDisplayMode
   * @return {!Element}
   */
  _setRatingClass(element, score, scoreDisplayMode) {
    const rating = Util.calculateRating(score, scoreDisplayMode);
    element.classList.add(`lh-audit--${scoreDisplayMode.toLowerCase()}`);
    if (scoreDisplayMode !== 'informative') {
      element.classList.add(`lh-audit--${rating}`);
    }
    return element;
  }

  /**
   * @param {LH.ReportResult.Category} category
   * @param {Record<string, LH.Result.ReportGroup>} groupDefinitions
   * @param {{gatherMode: LH.Result.GatherMode}=} options
   * @return {DocumentFragment}
   */
  renderCategoryHeader(category, groupDefinitions, options) {
    const component = this.dom.createComponent('categoryHeader');

    const gaugeContainerEl = this.dom.find('.lh-score__gauge', component);
    const gaugeEl = this.renderCategoryScore(category, groupDefinitions, options);
    gaugeContainerEl.appendChild(gaugeEl);

    if (category.description) {
      const descEl = this.dom.convertMarkdownLinkSnippets(category.description);
      this.dom.find('.lh-category-header__description', component).appendChild(descEl);
    }

    return component;
  }

  /**
   * Renders the group container for a group of audits. Individual audit elements can be added
   * directly to the returned element.
   * @param {LH.Result.ReportGroup} group
   * @return {[Element, Element | null]}
   */
  renderAuditGroup(group) {
    const groupEl = this.dom.createElement('div', 'lh-audit-group');

    const auditGroupHeader = this.dom.createElement('div', 'lh-audit-group__header');

    this.dom.createChildOf(auditGroupHeader, 'span', 'lh-audit-group__title')
      .textContent = group.title;
    groupEl.appendChild(auditGroupHeader);

    let footerEl = null;
    if (group.description) {
      footerEl = this.dom.convertMarkdownLinkSnippets(group.description);
      footerEl.classList.add('lh-audit-group__description', 'lh-audit-group__footer');
      groupEl.appendChild(footerEl);
    }

    return [groupEl, footerEl];
  }

  /**
   * Takes an array of auditRefs, groups them if requested, then returns an
   * array of audit and audit-group elements.
   * @param {Array<LH.ReportResult.AuditRef>} auditRefs
   * @param {Object<string, LH.Result.ReportGroup>} groupDefinitions
   * @return {Array<Element>}
   */
  _renderGroupedAudits(auditRefs, groupDefinitions) {
    // Audits grouped by their group (or under notAGroup).
    /** @type {Map<string, Array<LH.ReportResult.AuditRef>>} */
    const grouped = new Map();

    // Add audits without a group first so they will appear first.
    const notAGroup = 'NotAGroup';
    grouped.set(notAGroup, []);

    for (const auditRef of auditRefs) {
      const groupId = auditRef.group || notAGroup;
      const groupAuditRefs = grouped.get(groupId) || [];
      groupAuditRefs.push(auditRef);
      grouped.set(groupId, groupAuditRefs);
    }

    /** @type {Array<Element>} */
    const auditElements = [];

    for (const [groupId, groupAuditRefs] of grouped) {
      if (groupId === notAGroup) {
        // Push not-grouped audits individually.
        for (const auditRef of groupAuditRefs) {
          auditElements.push(this.renderAudit(auditRef));
        }
        continue;
      }

      // Push grouped audits as a group.
      const groupDef = groupDefinitions[groupId];
      const [auditGroupElem, auditGroupFooterEl] = this.renderAuditGroup(groupDef);
      for (const auditRef of groupAuditRefs) {
        auditGroupElem.insertBefore(this.renderAudit(auditRef), auditGroupFooterEl);
      }
      auditGroupElem.classList.add(`lh-audit-group--${groupId}`);
      auditElements.push(auditGroupElem);
    }

    return auditElements;
  }

  /**
   * Take a set of audits, group them if they have groups, then render in a top-level
   * clump that can't be expanded/collapsed.
   * @param {Array<LH.ReportResult.AuditRef>} auditRefs
   * @param {Object<string, LH.Result.ReportGroup>} groupDefinitions
   * @return {Element}
   */
  renderUnexpandableClump(auditRefs, groupDefinitions) {
    const clumpElement = this.dom.createElement('div');
    const elements = this._renderGroupedAudits(auditRefs, groupDefinitions);
    elements.forEach(elem => clumpElement.appendChild(elem));
    return clumpElement;
  }

  /**
   * Take a set of audits and render in a top-level, expandable clump that starts
   * in a collapsed state.
   * @param {Exclude<TopLevelClumpId, 'failed'>} clumpId
   * @param {{auditRefs: Array<LH.ReportResult.AuditRef>, description?: string}} clumpOpts
   * @return {!Element}
   */
  renderClump(clumpId, {auditRefs, description}) {
    const clumpComponent = this.dom.createComponent('clump');
    const clumpElement = this.dom.find('.lh-clump', clumpComponent);

    if (clumpId === 'warning') {
      clumpElement.setAttribute('open', '');
    }

    const headerEl = this.dom.find('.lh-audit-group__header', clumpElement);
    const title = this._clumpTitles[clumpId];
    this.dom.find('.lh-audit-group__title', headerEl).textContent = title;

    const itemCountEl = this.dom.find('.lh-audit-group__itemcount', clumpElement);
    itemCountEl.textContent = `(${auditRefs.length})`;

    // Add all audit results to the clump.
    const auditElements = auditRefs.map(this.renderAudit.bind(this));
    clumpElement.append(...auditElements);

    const el = this.dom.find('.lh-audit-group', clumpComponent);
    if (description) {
      const descriptionEl = this.dom.convertMarkdownLinkSnippets(description);
      descriptionEl.classList.add('lh-audit-group__description', 'lh-audit-group__footer');
      el.appendChild(descriptionEl);
    }

    this.dom.find('.lh-clump-toggletext--show', el).textContent = Util.i18n.strings.show;
    this.dom.find('.lh-clump-toggletext--hide', el).textContent = Util.i18n.strings.hide;

    clumpElement.classList.add(`lh-clump--${clumpId.toLowerCase()}`);
    return el;
  }

  /**
   * @param {LH.ReportResult.Category} category
   * @param {Record<string, LH.Result.ReportGroup>} groupDefinitions
   * @param {{gatherMode: LH.Result.GatherMode, omitLabel?: boolean, onPageAnchorRendered?: (link: HTMLAnchorElement) => void}=} options
   * @return {DocumentFragment}
   */
  renderCategoryScore(category, groupDefinitions, options) {
    let categoryScore;
    if (options && Util.shouldDisplayAsFraction(options.gatherMode)) {
      categoryScore = this.renderCategoryFraction(category);
    } else {
      categoryScore = this.renderScoreGauge(category, groupDefinitions);
    }

    if (options?.omitLabel) {
      const label = this.dom.find('.lh-gauge__label,.lh-fraction__label', categoryScore);
      label.remove();
    }

    if (options?.onPageAnchorRendered) {
      const anchor = this.dom.find('a', categoryScore);
      options.onPageAnchorRendered(anchor);
    }

    return categoryScore;
  }

  /**
   * @param {LH.ReportResult.Category} category
   * @param {Record<string, LH.Result.ReportGroup>} groupDefinitions
   * @return {DocumentFragment}
   */
  renderScoreGauge(category, groupDefinitions) { // eslint-disable-line no-unused-vars
    const tmpl = this.dom.createComponent('gauge');
    const wrapper = this.dom.find('a.lh-gauge__wrapper', tmpl);

    if (Util.isPluginCategory(category.id)) {
      wrapper.classList.add('lh-gauge__wrapper--plugin');
    }

    // Cast `null` to 0
    const numericScore = Number(category.score);
    const gauge = this.dom.find('.lh-gauge', tmpl);
    const gaugeArc = this.dom.find('circle.lh-gauge-arc', gauge);

    if (gaugeArc) this._setGaugeArc(gaugeArc, numericScore);

    const scoreOutOf100 = Math.round(numericScore * 100);
    const percentageEl = this.dom.find('div.lh-gauge__percentage', tmpl);
    percentageEl.textContent = scoreOutOf100.toString();
    if (category.score === null) {
      percentageEl.textContent = '?';
      percentageEl.title = Util.i18n.strings.errorLabel;
    }

    // Render a numerical score if the category has applicable audits, or no audits whatsoever.
    if (category.auditRefs.length === 0 || this.hasApplicableAudits(category)) {
      wrapper.classList.add(`lh-gauge__wrapper--${Util.calculateRating(category.score)}`);
    } else {
      wrapper.classList.add(`lh-gauge__wrapper--not-applicable`);
      percentageEl.textContent = '-';
      percentageEl.title = Util.i18n.strings.notApplicableAuditsGroupTitle;
    }

    this.dom.find('.lh-gauge__label', tmpl).textContent = category.title;
    return tmpl;
  }

  /**
   * @param {LH.ReportResult.Category} category
   * @return {DocumentFragment}
   */
  renderCategoryFraction(category) {
    const tmpl = this.dom.createComponent('fraction');
    const wrapper = this.dom.find('a.lh-fraction__wrapper', tmpl);

    const {numPassed, numPassableAudits, totalWeight} = Util.calculateCategoryFraction(category);

    const fraction = numPassed / numPassableAudits;
    const content = this.dom.find('.lh-fraction__content', tmpl);
    const text = this.dom.createElement('span');
    text.textContent = `${numPassed}/${numPassableAudits}`;
    content.appendChild(text);

    let rating = Util.calculateRating(fraction);

    // If none of the available audits can affect the score, a rating isn't useful.
    // The flow report should display the fraction with neutral icon and coloring in this case.
    if (totalWeight === 0) {
      rating = 'null';
    }

    wrapper.classList.add(`lh-fraction__wrapper--${rating}`);

    this.dom.find('.lh-fraction__label', tmpl).textContent = category.title;
    return tmpl;
  }

  /**
   * Returns true if an LH category has any non-"notApplicable" audits.
   * @param {LH.ReportResult.Category} category
   * @return {boolean}
   */
  hasApplicableAudits(category) {
    return category.auditRefs.some(ref => ref.result.scoreDisplayMode !== 'notApplicable');
  }

  /**
   * Define the score arc of the gauge
   * Credit to xgad for the original technique: https://codepen.io/xgad/post/svg-radial-progress-meters
   * @param {SVGCircleElement} arcElem
   * @param {number} percent
   */
  _setGaugeArc(arcElem, percent) {
    const circumferencePx = 2 * Math.PI * Number(arcElem.getAttribute('r'));
    // The rounded linecap of the stroke extends the arc past its start and end.
    // First, we tweak the -90deg rotation to start exactly at the top of the circle.
    const strokeWidthPx = Number(arcElem.getAttribute('stroke-width'));
    const rotationalAdjustmentPercent = 0.25 * strokeWidthPx / circumferencePx;
    arcElem.style.transform = `rotate(${-90 + rotationalAdjustmentPercent * 360}deg)`;

    // Then, we terminate the line a little early as well.
    let arcLengthPx = percent * circumferencePx - strokeWidthPx / 2;
    // Special cases. No dot for 0, and full ring if 100
    if (percent === 0) arcElem.style.opacity = '0';
    if (percent === 1) arcLengthPx = circumferencePx;

    arcElem.style.strokeDasharray = `${Math.max(arcLengthPx, 0)} ${circumferencePx}`;
  }

  /**
   * @param {LH.ReportResult.AuditRef} audit
   * @return {boolean}
   */
  _auditHasWarning(audit) {
    return Boolean(audit.result.warnings?.length);
  }

  /**
   * Returns the id of the top-level clump to put this audit in.
   * @param {LH.ReportResult.AuditRef} auditRef
   * @return {TopLevelClumpId}
   */
  _getClumpIdForAuditRef(auditRef) {
    const scoreDisplayMode = auditRef.result.scoreDisplayMode;
    if (scoreDisplayMode === 'manual' || scoreDisplayMode === 'notApplicable') {
      return scoreDisplayMode;
    }

    if (Util.showAsPassed(auditRef.result)) {
      if (this._auditHasWarning(auditRef)) {
        return 'warning';
      } else {
        return 'passed';
      }
    } else {
      return 'failed';
    }
  }

  /**
   * Renders a set of top level sections (clumps), under a status of failed, warning,
   * manual, passed, or notApplicable. The result ends up something like:
   *
   * failed clump
   *   ├── audit 1 (w/o group)
   *   ├── audit 2 (w/o group)
   *   ├── audit group
   *   |  ├── audit 3
   *   |  └── audit 4
   *   └── audit group
   *      ├── audit 5
   *      └── audit 6
   * other clump (e.g. 'manual')
   *   ├── audit 1
   *   ├── audit 2
   *   ├── …
   *   ⋮
   * @param {LH.ReportResult.Category} category
   * @param {Object<string, LH.Result.ReportGroup>=} groupDefinitions
   * @param {{gatherMode: LH.Result.GatherMode}=} options
   * @return {Element}
   */
  render(category, groupDefinitions = {}, options) {
    const element = this.dom.createElement('div', 'lh-category');
    element.id = category.id;
    element.appendChild(this.renderCategoryHeader(category, groupDefinitions, options));

    // Top level clumps for audits, in order they will appear in the report.
    /** @type {Map<TopLevelClumpId, Array<LH.ReportResult.AuditRef>>} */
    const clumps = new Map();
    clumps.set('failed', []);
    clumps.set('warning', []);
    clumps.set('manual', []);
    clumps.set('passed', []);
    clumps.set('notApplicable', []);

    // Sort audits into clumps.
    for (const auditRef of category.auditRefs) {
      const clumpId = this._getClumpIdForAuditRef(auditRef);
      const clump = /** @type {Array<LH.ReportResult.AuditRef>} */ (clumps.get(clumpId)); // already defined
      clump.push(auditRef);
      clumps.set(clumpId, clump);
    }

    // Sort audits by weight.
    for (const auditRefs of clumps.values()) {
      auditRefs.sort((a, b) => {
        return b.weight - a.weight;
      });
    }

    // Render each clump.
    for (const [clumpId, auditRefs] of clumps) {
      if (auditRefs.length === 0) continue;

      if (clumpId === 'failed') {
        const clumpElem = this.renderUnexpandableClump(auditRefs, groupDefinitions);
        clumpElem.classList.add(`lh-clump--failed`);
        element.appendChild(clumpElem);
        continue;
      }

      const description = clumpId === 'manual' ? category.manualDescription : undefined;
      const clumpElem = this.renderClump(clumpId, {auditRefs, description});
      element.appendChild(clumpElem);
    }

    return element;
  }
}

/**
 * @license
 * Copyright 2017 The Lighthouse Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/** @typedef {import('./dom.js').DOM} DOM */
/** @typedef {import('./details-renderer.js').DetailsRenderer} DetailsRenderer */
/**
 * @typedef CRCSegment
 * @property {LH.Audit.Details.SimpleCriticalRequestNode[string]} node
 * @property {boolean} isLastChild
 * @property {boolean} hasChildren
 * @property {number} startTime
 * @property {number} transferSize
 * @property {boolean[]} treeMarkers
 */

class CriticalRequestChainRenderer {
  /**
   * Create render context for critical-request-chain tree display.
   * @param {LH.Audit.Details.SimpleCriticalRequestNode} tree
   * @return {{tree: LH.Audit.Details.SimpleCriticalRequestNode, startTime: number, transferSize: number}}
   */
  static initTree(tree) {
    let startTime = 0;
    const rootNodes = Object.keys(tree);
    if (rootNodes.length > 0) {
      const node = tree[rootNodes[0]];
      startTime = node.request.startTime;
    }

    return {tree, startTime, transferSize: 0};
  }

  /**
   * Helper to create context for each critical-request-chain node based on its
   * parent. Calculates if this node is the last child, whether it has any
   * children itself and what the tree looks like all the way back up to the root,
   * so the tree markers can be drawn correctly.
   * @param {LH.Audit.Details.SimpleCriticalRequestNode} parent
   * @param {string} id
   * @param {number} startTime
   * @param {number} transferSize
   * @param {Array<boolean>=} treeMarkers
   * @param {boolean=} parentIsLastChild
   * @return {CRCSegment}
   */
  static createSegment(parent, id, startTime, transferSize, treeMarkers, parentIsLastChild) {
    const node = parent[id];
    const siblings = Object.keys(parent);
    const isLastChild = siblings.indexOf(id) === (siblings.length - 1);
    const hasChildren = !!node.children && Object.keys(node.children).length > 0;

    // Copy the tree markers so that we don't change by reference.
    const newTreeMarkers = Array.isArray(treeMarkers) ? treeMarkers.slice(0) : [];

    // Add on the new entry.
    if (typeof parentIsLastChild !== 'undefined') {
      newTreeMarkers.push(!parentIsLastChild);
    }

    return {
      node,
      isLastChild,
      hasChildren,
      startTime,
      transferSize: transferSize + node.request.transferSize,
      treeMarkers: newTreeMarkers,
    };
  }

  /**
   * Creates the DOM for a tree segment.
   * @param {DOM} dom
   * @param {CRCSegment} segment
   * @param {DetailsRenderer} detailsRenderer
   * @return {Node}
   */
  static createChainNode(dom, segment, detailsRenderer) {
    const chainEl = dom.createComponent('crcChain');

    // Hovering over request shows full URL.
    dom.find('.lh-crc-node', chainEl).setAttribute('title', segment.node.request.url);

    const treeMarkeEl = dom.find('.lh-crc-node__tree-marker', chainEl);

    // Construct lines and add spacers for sub requests.
    segment.treeMarkers.forEach(separator => {
      if (separator) {
        treeMarkeEl.appendChild(dom.createElement('span', 'lh-tree-marker lh-vert'));
        treeMarkeEl.appendChild(dom.createElement('span', 'lh-tree-marker'));
      } else {
        treeMarkeEl.appendChild(dom.createElement('span', 'lh-tree-marker'));
        treeMarkeEl.appendChild(dom.createElement('span', 'lh-tree-marker'));
      }
    });

    if (segment.isLastChild) {
      treeMarkeEl.appendChild(dom.createElement('span', 'lh-tree-marker lh-up-right'));
      treeMarkeEl.appendChild(dom.createElement('span', 'lh-tree-marker lh-right'));
    } else {
      treeMarkeEl.appendChild(dom.createElement('span', 'lh-tree-marker lh-vert-right'));
      treeMarkeEl.appendChild(dom.createElement('span', 'lh-tree-marker lh-right'));
    }

    if (segment.hasChildren) {
      treeMarkeEl.appendChild(dom.createElement('span', 'lh-tree-marker lh-horiz-down'));
    } else {
      treeMarkeEl.appendChild(dom.createElement('span', 'lh-tree-marker lh-right'));
    }

    // Fill in url, host, and request size information.
    const url = segment.node.request.url;
    const linkEl = detailsRenderer.renderTextURL(url);
    const treevalEl = dom.find('.lh-crc-node__tree-value', chainEl);
    treevalEl.appendChild(linkEl);

    if (!segment.hasChildren) {
      const {startTime, endTime, transferSize} = segment.node.request;
      const span = dom.createElement('span', 'lh-crc-node__chain-duration');
      span.textContent = ' - ' + Util.i18n.formatMilliseconds((endTime - startTime) * 1000) + ', ';
      const span2 = dom.createElement('span', 'lh-crc-node__chain-duration');
      span2.textContent = Util.i18n.formatBytesToKiB(transferSize, 0.01);

      treevalEl.appendChild(span);
      treevalEl.appendChild(span2);
    }

    return chainEl;
  }

  /**
   * Recursively builds a tree from segments.
   * @param {DOM} dom
   * @param {DocumentFragment} tmpl
   * @param {CRCSegment} segment
   * @param {Element} elem Parent element.
   * @param {LH.Audit.Details.CriticalRequestChain} details
   * @param {DetailsRenderer} detailsRenderer
   */
  static buildTree(dom, tmpl, segment, elem, details, detailsRenderer) {
    elem.appendChild(CRCRenderer.createChainNode(dom, segment, detailsRenderer));
    if (segment.node.children) {
      for (const key of Object.keys(segment.node.children)) {
        const childSegment = CRCRenderer.createSegment(segment.node.children, key,
          segment.startTime, segment.transferSize, segment.treeMarkers, segment.isLastChild);
        CRCRenderer.buildTree(dom, tmpl, childSegment, elem, details, detailsRenderer);
      }
    }
  }

  /**
   * @param {DOM} dom
   * @param {LH.Audit.Details.CriticalRequestChain} details
   * @param {DetailsRenderer} detailsRenderer
   * @return {Element}
   */
  static render(dom, details, detailsRenderer) {
    const tmpl = dom.createComponent('crc');
    const containerEl = dom.find('.lh-crc', tmpl);

    // Fill in top summary.
    dom.find('.lh-crc-initial-nav', tmpl).textContent = Util.i18n.strings.crcInitialNavigation;
    dom.find('.lh-crc__longest_duration_label', tmpl).textContent =
        Util.i18n.strings.crcLongestDurationLabel;
    dom.find('.lh-crc__longest_duration', tmpl).textContent =
        Util.i18n.formatMilliseconds(details.longestChain.duration);

    // Construct visual tree.
    const root = CRCRenderer.initTree(details.chains);
    for (const key of Object.keys(root.tree)) {
      const segment = CRCRenderer.createSegment(root.tree, key, root.startTime, root.transferSize);
      CRCRenderer.buildTree(dom, tmpl, segment, containerEl, details, detailsRenderer);
    }

    return dom.find('.lh-crc-container', tmpl);
  }
}

// Alias b/c the name is really long.
const CRCRenderer = CriticalRequestChainRenderer;

/**
 * @license Copyright 2020 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */

/**
 * @param {LH.Audit.Details.FullPageScreenshot['screenshot']} screenshot
 * @param {LH.Audit.Details.Rect} rect
 * @return {boolean}
 */
function screenshotOverlapsRect(screenshot, rect) {
  return rect.left <= screenshot.width &&
    0 <= rect.right &&
    rect.top <= screenshot.height &&
    0 <= rect.bottom;
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * @param {Rect} rect
 */
function getElementRectCenterPoint(rect) {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

class ElementScreenshotRenderer {
  /**
   * Given the location of an element and the sizes of the preview and screenshot,
   * compute the absolute positions (in screenshot coordinate scale) of the screenshot content
   * and the highlighted rect around the element.
   * @param {Rect} elementRectSC
   * @param {Size} elementPreviewSizeSC
   * @param {Size} screenshotSize
   */
  static getScreenshotPositions(elementRectSC, elementPreviewSizeSC, screenshotSize) {
    const elementRectCenter = getElementRectCenterPoint(elementRectSC);

    // Try to center clipped region.
    const screenshotLeftVisibleEdge = clamp(
      elementRectCenter.x - elementPreviewSizeSC.width / 2,
      0, screenshotSize.width - elementPreviewSizeSC.width
    );
    const screenshotTopVisisbleEdge = clamp(
      elementRectCenter.y - elementPreviewSizeSC.height / 2,
      0, screenshotSize.height - elementPreviewSizeSC.height
    );

    return {
      screenshot: {
        left: screenshotLeftVisibleEdge,
        top: screenshotTopVisisbleEdge,
      },
      clip: {
        left: elementRectSC.left - screenshotLeftVisibleEdge,
        top: elementRectSC.top - screenshotTopVisisbleEdge,
      },
    };
  }

  /**
   * Render a clipPath SVG element to assist marking the element's rect.
   * The elementRect and previewSize are in screenshot coordinate scale.
   * @param {DOM} dom
   * @param {HTMLElement} maskEl
   * @param {{left: number, top: number}} positionClip
   * @param {Rect} elementRect
   * @param {Size} elementPreviewSize
   */
  static renderClipPathInScreenshot(dom, maskEl, positionClip, elementRect, elementPreviewSize) {
    const clipPathEl = dom.find('clipPath', maskEl);
    const clipId = `clip-${Util.getUniqueSuffix()}`;
    clipPathEl.id = clipId;
    maskEl.style.clipPath = `url(#${clipId})`;

    // Normalize values between 0-1.
    const top = positionClip.top / elementPreviewSize.height;
    const bottom = top + elementRect.height / elementPreviewSize.height;
    const left = positionClip.left / elementPreviewSize.width;
    const right = left + elementRect.width / elementPreviewSize.width;

    const polygonsPoints = [
      `0,0             1,0            1,${top}          0,${top}`,
      `0,${bottom}     1,${bottom}    1,1               0,1`,
      `0,${top}        ${left},${top} ${left},${bottom} 0,${bottom}`,
      `${right},${top} 1,${top}       1,${bottom}       ${right},${bottom}`,
    ];
    for (const points of polygonsPoints) {
      const pointEl = dom.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      pointEl.setAttribute('points', points);
      clipPathEl.append(pointEl);
    }
  }

  /**
   * Called by report renderer. Defines a css variable used by any element screenshots
   * in the provided report element.
   * Allows for multiple Lighthouse reports to be rendered on the page, each with their
   * own full page screenshot.
   * @param {HTMLElement} el
   * @param {LH.Audit.Details.FullPageScreenshot['screenshot']} screenshot
   */
  static installFullPageScreenshot(el, screenshot) {
    el.style.setProperty('--element-screenshot-url', `url('${screenshot.data}')`);
  }

  /**
   * Installs the lightbox elements and wires up click listeners to all .lh-element-screenshot elements.
   * @param {InstallOverlayFeatureParams} opts
   */
  static installOverlayFeature(opts) {
    const {dom, rootEl, overlayContainerEl, fullPageScreenshot} = opts;
    const screenshotOverlayClass = 'lh-screenshot-overlay--enabled';
    // Don't install the feature more than once.
    if (rootEl.classList.contains(screenshotOverlayClass)) return;
    rootEl.classList.add(screenshotOverlayClass);

    // Add a single listener to the provided element to handle all clicks within (event delegation).
    rootEl.addEventListener('click', e => {
      const target = /** @type {?HTMLElement} */ (e.target);
      if (!target) return;
      // Only activate the overlay for clicks on the screenshot *preview* of an element, not the full-size too.
      const el = /** @type {?HTMLElement} */ (target.closest('.lh-node > .lh-element-screenshot'));
      if (!el) return;

      const overlay = dom.createElement('div', 'lh-element-screenshot__overlay');
      overlayContainerEl.append(overlay);

      // The newly-added overlay has the dimensions we need.
      const maxLightboxSize = {
        width: overlay.clientWidth * 0.95,
        height: overlay.clientHeight * 0.80,
      };

      const elementRectSC = {
        width: Number(el.dataset['rectWidth']),
        height: Number(el.dataset['rectHeight']),
        left: Number(el.dataset['rectLeft']),
        right: Number(el.dataset['rectLeft']) + Number(el.dataset['rectWidth']),
        top: Number(el.dataset['rectTop']),
        bottom: Number(el.dataset['rectTop']) + Number(el.dataset['rectHeight']),
      };
      const screenshotElement = ElementScreenshotRenderer.render(
        dom,
        fullPageScreenshot.screenshot,
        elementRectSC,
        maxLightboxSize
      );

      // This would be unexpected here.
      // When `screenshotElement` is `null`, there is also no thumbnail element for the user to have clicked to make it this far.
      if (!screenshotElement) {
        overlay.remove();
        return;
      }
      overlay.appendChild(screenshotElement);
      overlay.addEventListener('click', () => overlay.remove());
    });
  }

  /**
   * Given the size of the element in the screenshot and the total available size of our preview container,
   * compute the factor by which we need to zoom out to view the entire element with context.
   * @param {Rect} elementRectSC
   * @param {Size} renderContainerSizeDC
   * @return {number}
   */
  static _computeZoomFactor(elementRectSC, renderContainerSizeDC) {
    const targetClipToViewportRatio = 0.75;
    const zoomRatioXY = {
      x: renderContainerSizeDC.width / elementRectSC.width,
      y: renderContainerSizeDC.height / elementRectSC.height,
    };
    const zoomFactor = targetClipToViewportRatio * Math.min(zoomRatioXY.x, zoomRatioXY.y);
    return Math.min(1, zoomFactor);
  }

  /**
   * Renders an element with surrounding context from the full page screenshot.
   * Used to render both the thumbnail preview in details tables and the full-page screenshot in the lightbox.
   * Returns null if element rect is outside screenshot bounds.
   * @param {DOM} dom
   * @param {LH.Audit.Details.FullPageScreenshot['screenshot']} screenshot
   * @param {Rect} elementRectSC Region of screenshot to highlight.
   * @param {Size} maxRenderSizeDC e.g. maxThumbnailSize or maxLightboxSize.
   * @return {Element|null}
   */
  static render(dom, screenshot, elementRectSC, maxRenderSizeDC) {
    if (!screenshotOverlapsRect(screenshot, elementRectSC)) {
      return null;
    }

    const tmpl = dom.createComponent('elementScreenshot');
    const containerEl = dom.find('div.lh-element-screenshot', tmpl);

    containerEl.dataset['rectWidth'] = elementRectSC.width.toString();
    containerEl.dataset['rectHeight'] = elementRectSC.height.toString();
    containerEl.dataset['rectLeft'] = elementRectSC.left.toString();
    containerEl.dataset['rectTop'] = elementRectSC.top.toString();

    // Zoom out when highlighted region takes up most of the viewport.
    // This provides more context for where on the page this element is.
    const zoomFactor = this._computeZoomFactor(elementRectSC, maxRenderSizeDC);

    const elementPreviewSizeSC = {
      width: maxRenderSizeDC.width / zoomFactor,
      height: maxRenderSizeDC.height / zoomFactor,
    };
    elementPreviewSizeSC.width = Math.min(screenshot.width, elementPreviewSizeSC.width);
    /* This preview size is either the size of the thumbnail or size of the Lightbox */
    const elementPreviewSizeDC = {
      width: elementPreviewSizeSC.width * zoomFactor,
      height: elementPreviewSizeSC.height * zoomFactor,
    };

    const positions = ElementScreenshotRenderer.getScreenshotPositions(
      elementRectSC,
      elementPreviewSizeSC,
      {width: screenshot.width, height: screenshot.height}
    );

    const contentEl = dom.find('div.lh-element-screenshot__content', containerEl);
    contentEl.style.top = `-${elementPreviewSizeDC.height}px`;

    const imageEl = dom.find('div.lh-element-screenshot__image', containerEl);
    imageEl.style.width = elementPreviewSizeDC.width + 'px';
    imageEl.style.height = elementPreviewSizeDC.height + 'px';

    imageEl.style.backgroundPositionY = -(positions.screenshot.top * zoomFactor) + 'px';
    imageEl.style.backgroundPositionX = -(positions.screenshot.left * zoomFactor) + 'px';
    imageEl.style.backgroundSize =
      `${screenshot.width * zoomFactor}px ${screenshot.height * zoomFactor}px`;

    const markerEl = dom.find('div.lh-element-screenshot__element-marker', containerEl);
    markerEl.style.width = elementRectSC.width * zoomFactor + 'px';
    markerEl.style.height = elementRectSC.height * zoomFactor + 'px';
    markerEl.style.left = positions.clip.left * zoomFactor + 'px';
    markerEl.style.top = positions.clip.top * zoomFactor + 'px';

    const maskEl = dom.find('div.lh-element-screenshot__mask', containerEl);
    maskEl.style.width = elementPreviewSizeDC.width + 'px';
    maskEl.style.height = elementPreviewSizeDC.height + 'px';

    ElementScreenshotRenderer.renderClipPathInScreenshot(
      dom,
      maskEl,
      positions.clip,
      elementRectSC,
      elementPreviewSizeSC
    );

    return containerEl;
  }
}

/**
 * @license
 * Copyright 2017 The Lighthouse Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const URL_PREFIXES = ['http://', 'https://', 'data:'];

class DetailsRenderer {
  /**
   * @param {DOM} dom
   * @param {{fullPageScreenshot?: LH.Audit.Details.FullPageScreenshot}} [options]
   */
  constructor(dom, options = {}) {
    this._dom = dom;
    this._fullPageScreenshot = options.fullPageScreenshot;
  }

  /**
   * @param {AuditDetails} details
   * @return {Element|null}
   */
  render(details) {
    switch (details.type) {
      case 'filmstrip':
        return this._renderFilmstrip(details);
      case 'list':
        return this._renderList(details);
      case 'table':
        return this._renderTable(details);
      case 'criticalrequestchain':
        return CriticalRequestChainRenderer.render(this._dom, details, this);
      case 'opportunity':
        return this._renderTable(details);

      // Internal-only details, not for rendering.
      case 'screenshot':
      case 'debugdata':
      case 'full-page-screenshot':
      case 'treemap-data':
        return null;

      default: {
        // @ts-expect-error tsc thinks this is unreachable, but be forward compatible
        // with new unexpected detail types.
        return this._renderUnknown(details.type, details);
      }
    }
  }

  /**
   * @param {{value: number, granularity?: number}} details
   * @return {Element}
   */
  _renderBytes(details) {
    // TODO: handle displayUnit once we have something other than 'kb'
    // Note that 'kb' is historical and actually represents KiB.
    const value = Util.i18n.formatBytesToKiB(details.value, details.granularity);
    const textEl = this._renderText(value);
    textEl.title = Util.i18n.formatBytes(details.value);
    return textEl;
  }

  /**
   * @param {{value: number, granularity?: number, displayUnit?: string}} details
   * @return {Element}
   */
  _renderMilliseconds(details) {
    let value = Util.i18n.formatMilliseconds(details.value, details.granularity);
    if (details.displayUnit === 'duration') {
      value = Util.i18n.formatDuration(details.value);
    }

    return this._renderText(value);
  }

  /**
   * @param {string} text
   * @return {HTMLElement}
   */
  renderTextURL(text) {
    const url = text;

    let displayedPath;
    let displayedHost;
    let title;
    try {
      const parsed = Util.parseURL(url);
      displayedPath = parsed.file === '/' ? parsed.origin : parsed.file;
      displayedHost = parsed.file === '/' || parsed.hostname === '' ? '' : `(${parsed.hostname})`;
      title = url;
    } catch (e) {
      displayedPath = url;
    }

    const element = this._dom.createElement('div', 'lh-text__url');
    element.appendChild(this._renderLink({text: displayedPath, url}));

    if (displayedHost) {
      const hostElem = this._renderText(displayedHost);
      hostElem.classList.add('lh-text__url-host');
      element.appendChild(hostElem);
    }

    if (title) {
      element.title = url;
      // set the url on the element's dataset which we use to check 3rd party origins
      element.dataset.url = url;
    }
    return element;
  }

  /**
   * @param {{text: string, url: string}} details
   * @return {HTMLElement}
   */
  _renderLink(details) {
    const a = this._dom.createElement('a');
    this._dom.safelySetHref(a, details.url);

    if (!a.href) {
      // Fall back to just the link text if invalid or protocol not allowed.
      const element = this._renderText(details.text);
      element.classList.add('lh-link');
      return element;
    }

    a.rel = 'noopener';
    a.target = '_blank';
    a.textContent = details.text;
    a.classList.add('lh-link');
    return a;
  }

  /**
   * @param {string} text
   * @return {HTMLDivElement}
   */
  _renderText(text) {
    const element = this._dom.createElement('div', 'lh-text');
    element.textContent = text;
    return element;
  }

  /**
   * @param {{value: number, granularity?: number}} details
   * @return {Element}
   */
  _renderNumeric(details) {
    const value = Util.i18n.formatNumber(details.value, details.granularity);
    const element = this._dom.createElement('div', 'lh-numeric');
    element.textContent = value;
    return element;
  }

  /**
   * Create small thumbnail with scaled down image asset.
   * @param {string} details
   * @return {Element}
   */
  _renderThumbnail(details) {
    const element = this._dom.createElement('img', 'lh-thumbnail');
    const strValue = details;
    element.src = strValue;
    element.title = strValue;
    element.alt = '';
    return element;
  }

  /**
   * @param {string} type
   * @param {*} value
   */
  _renderUnknown(type, value) {
    // eslint-disable-next-line no-console
    console.error(`Unknown details type: ${type}`, value);
    const element = this._dom.createElement('details', 'lh-unknown');
    this._dom.createChildOf(element, 'summary').textContent =
      `We don't know how to render audit details of type \`${type}\`. ` +
      'The Lighthouse version that collected this data is likely newer than the Lighthouse ' +
      'version of the report renderer. Expand for the raw JSON.';
    this._dom.createChildOf(element, 'pre').textContent = JSON.stringify(value, null, 2);
    return element;
  }

  /**
   * Render a details item value for embedding in a table. Renders the value
   * based on the heading's valueType, unless the value itself has a `type`
   * property to override it.
   * @param {TableItemValue} value
   * @param {LH.Audit.Details.OpportunityColumnHeading} heading
   * @return {Element|null}
   */
  _renderTableValue(value, heading) {
    if (value === undefined || value === null) {
      return null;
    }

    // First deal with the possible object forms of value.
    if (typeof value === 'object') {
      // The value's type overrides the heading's for this column.
      switch (value.type) {
        case 'code': {
          return this._renderCode(value.value);
        }
        case 'link': {
          return this._renderLink(value);
        }
        case 'node': {
          return this.renderNode(value);
        }
        case 'numeric': {
          return this._renderNumeric(value);
        }
        case 'source-location': {
          return this.renderSourceLocation(value);
        }
        case 'url': {
          return this.renderTextURL(value.value);
        }
        default: {
          return this._renderUnknown(value.type, value);
        }
      }
    }

    // Next, deal with primitives.
    switch (heading.valueType) {
      case 'bytes': {
        const numValue = Number(value);
        return this._renderBytes({value: numValue, granularity: heading.granularity});
      }
      case 'code': {
        const strValue = String(value);
        return this._renderCode(strValue);
      }
      case 'ms': {
        const msValue = {
          value: Number(value),
          granularity: heading.granularity,
          displayUnit: heading.displayUnit,
        };
        return this._renderMilliseconds(msValue);
      }
      case 'numeric': {
        const numValue = Number(value);
        return this._renderNumeric({value: numValue, granularity: heading.granularity});
      }
      case 'text': {
        const strValue = String(value);
        return this._renderText(strValue);
      }
      case 'thumbnail': {
        const strValue = String(value);
        return this._renderThumbnail(strValue);
      }
      case 'timespanMs': {
        const numValue = Number(value);
        return this._renderMilliseconds({value: numValue});
      }
      case 'url': {
        const strValue = String(value);
        if (URL_PREFIXES.some(prefix => strValue.startsWith(prefix))) {
          return this.renderTextURL(strValue);
        } else {
          // Fall back to <pre> rendering if not actually a URL.
          return this._renderCode(strValue);
        }
      }
      default: {
        return this._renderUnknown(heading.valueType, value);
      }
    }
  }

  /**
   * Get the headings of a table-like details object, converted into the
   * OpportunityColumnHeading type until we have all details use the same
   * heading format.
   * @param {Table|OpportunityTable} tableLike
   * @return {OpportunityTable['headings']}
   */
  _getCanonicalizedHeadingsFromTable(tableLike) {
    if (tableLike.type === 'opportunity') {
      return tableLike.headings;
    }

    return tableLike.headings.map(heading => this._getCanonicalizedHeading(heading));
  }

  /**
   * Get the headings of a table-like details object, converted into the
   * OpportunityColumnHeading type until we have all details use the same
   * heading format.
   * @param {Table['headings'][number]} heading
   * @return {OpportunityTable['headings'][number]}
   */
  _getCanonicalizedHeading(heading) {
    let subItemsHeading;
    if (heading.subItemsHeading) {
      subItemsHeading = this._getCanonicalizedsubItemsHeading(heading.subItemsHeading, heading);
    }

    return {
      key: heading.key,
      valueType: heading.itemType,
      subItemsHeading,
      label: heading.text,
      displayUnit: heading.displayUnit,
      granularity: heading.granularity,
    };
  }

  /**
   * @param {Exclude<LH.Audit.Details.TableColumnHeading['subItemsHeading'], undefined>} subItemsHeading
   * @param {LH.Audit.Details.TableColumnHeading} parentHeading
   * @return {LH.Audit.Details.OpportunityColumnHeading['subItemsHeading']}
   */
  _getCanonicalizedsubItemsHeading(subItemsHeading, parentHeading) {
    // Low-friction way to prevent committing a falsy key (which is never allowed for
    // a subItemsHeading) from passing in CI.
    if (!subItemsHeading.key) {
      // eslint-disable-next-line no-console
      console.warn('key should not be null');
    }

    return {
      key: subItemsHeading.key || '',
      valueType: subItemsHeading.itemType || parentHeading.itemType,
      granularity: subItemsHeading.granularity || parentHeading.granularity,
      displayUnit: subItemsHeading.displayUnit || parentHeading.displayUnit,
    };
  }

  /**
   * Returns a new heading where the values are defined first by `heading.subItemsHeading`,
   * and secondly by `heading`. If there is no subItemsHeading, returns null, which will
   * be rendered as an empty column.
   * @param {LH.Audit.Details.OpportunityColumnHeading} heading
   * @return {LH.Audit.Details.OpportunityColumnHeading | null}
   */
  _getDerivedsubItemsHeading(heading) {
    if (!heading.subItemsHeading) return null;
    return {
      key: heading.subItemsHeading.key || '',
      valueType: heading.subItemsHeading.valueType || heading.valueType,
      granularity: heading.subItemsHeading.granularity || heading.granularity,
      displayUnit: heading.subItemsHeading.displayUnit || heading.displayUnit,
      label: '',
    };
  }

  /**
   * @param {TableItem} item
   * @param {(LH.Audit.Details.OpportunityColumnHeading | null)[]} headings
   */
  _renderTableRow(item, headings) {
    const rowElem = this._dom.createElement('tr');

    for (const heading of headings) {
      // Empty cell if no heading or heading key for this column.
      if (!heading || !heading.key) {
        this._dom.createChildOf(rowElem, 'td', 'lh-table-column--empty');
        continue;
      }

      const value = item[heading.key];
      let valueElement;
      if (value !== undefined && value !== null) {
        valueElement = this._renderTableValue(value, heading);
      }

      if (valueElement) {
        const classes = `lh-table-column--${heading.valueType}`;
        this._dom.createChildOf(rowElem, 'td', classes).appendChild(valueElement);
      } else {
        // Empty cell is rendered for a column if:
        // - the pair is null
        // - the heading key is null
        // - the value is undefined/null
        this._dom.createChildOf(rowElem, 'td', 'lh-table-column--empty');
      }
    }

    return rowElem;
  }

  /**
   * Renders one or more rows from a details table item. A single table item can
   * expand into multiple rows, if there is a subItemsHeading.
   * @param {TableItem} item
   * @param {LH.Audit.Details.OpportunityColumnHeading[]} headings
   */
  _renderTableRowsFromItem(item, headings) {
    const fragment = this._dom.createFragment();
    fragment.append(this._renderTableRow(item, headings));

    if (!item.subItems) return fragment;

    const subItemsHeadings = headings.map(this._getDerivedsubItemsHeading);
    if (!subItemsHeadings.some(Boolean)) return fragment;

    for (const subItem of item.subItems.items) {
      const rowEl = this._renderTableRow(subItem, subItemsHeadings);
      rowEl.classList.add('lh-sub-item-row');
      fragment.append(rowEl);
    }

    return fragment;
  }

  /**
   * @param {OpportunityTable|Table} details
   * @return {Element}
   */
  _renderTable(details) {
    if (!details.items.length) return this._dom.createElement('span');

    const tableElem = this._dom.createElement('table', 'lh-table');
    const theadElem = this._dom.createChildOf(tableElem, 'thead');
    const theadTrElem = this._dom.createChildOf(theadElem, 'tr');

    const headings = this._getCanonicalizedHeadingsFromTable(details);

    for (const heading of headings) {
      const valueType = heading.valueType || 'text';
      const classes = `lh-table-column--${valueType}`;
      const labelEl = this._dom.createElement('div', 'lh-text');
      labelEl.textContent = heading.label;
      this._dom.createChildOf(theadTrElem, 'th', classes).appendChild(labelEl);
    }

    const tbodyElem = this._dom.createChildOf(tableElem, 'tbody');
    let even = true;
    for (const item of details.items) {
      const rowsFragment = this._renderTableRowsFromItem(item, headings);
      for (const rowEl of this._dom.findAll('tr', rowsFragment)) {
        // For zebra styling.
        rowEl.classList.add(even ? 'lh-row--even' : 'lh-row--odd');
      }
      even = !even;
      tbodyElem.append(rowsFragment);
    }

    return tableElem;
  }

  /**
   * @param {LH.FormattedIcu<LH.Audit.Details.List>} details
   * @return {Element}
   */
  _renderList(details) {
    const listContainer = this._dom.createElement('div', 'lh-list');

    details.items.forEach(item => {
      const listItem = this.render(item);
      if (!listItem) return;
      listContainer.append(listItem);
    });

    return listContainer;
  }

  /**
   * @param {LH.Audit.Details.NodeValue} item
   * @return {Element}
   */
  renderNode(item) {
    const element = this._dom.createElement('span', 'lh-node');
    if (item.nodeLabel) {
      const nodeLabelEl = this._dom.createElement('div');
      nodeLabelEl.textContent = item.nodeLabel;
      element.appendChild(nodeLabelEl);
    }
    if (item.snippet) {
      const snippetEl = this._dom.createElement('div');
      snippetEl.classList.add('lh-node__snippet');
      snippetEl.textContent = item.snippet;
      element.appendChild(snippetEl);
    }
    if (item.selector) {
      element.title = item.selector;
    }
    if (item.path) element.setAttribute('data-path', item.path);
    if (item.selector) element.setAttribute('data-selector', item.selector);
    if (item.snippet) element.setAttribute('data-snippet', item.snippet);

    if (!this._fullPageScreenshot) return element;

    const rect = item.lhId && this._fullPageScreenshot.nodes[item.lhId];
    if (!rect || rect.width === 0 || rect.height === 0) return element;

    const maxThumbnailSize = {width: 147, height: 100};
    const elementScreenshot = ElementScreenshotRenderer.render(
      this._dom,
      this._fullPageScreenshot.screenshot,
      rect,
      maxThumbnailSize
    );
    if (elementScreenshot) element.prepend(elementScreenshot);

    return element;
  }

  /**
   * @param {LH.Audit.Details.SourceLocationValue} item
   * @return {Element|null}
   * @protected
   */
  renderSourceLocation(item) {
    if (!item.url) {
      return null;
    }

    // Lines are shown as one-indexed.
    const generatedLocation = `${item.url}:${item.line + 1}:${item.column}`;
    let sourceMappedOriginalLocation;
    if (item.original) {
      const file = item.original.file || '<unmapped>';
      sourceMappedOriginalLocation = `${file}:${item.original.line + 1}:${item.original.column}`;
    }

    // We render slightly differently based on presence of source map and provenance of URL.
    let element;
    if (item.urlProvider === 'network' && sourceMappedOriginalLocation) {
      element = this._renderLink({
        url: item.url,
        text: sourceMappedOriginalLocation,
      });
      element.title = `maps to generated location ${generatedLocation}`;
    } else if (item.urlProvider === 'network' && !sourceMappedOriginalLocation) {
      element = this.renderTextURL(item.url);
      this._dom.find('.lh-link', element).textContent += `:${item.line + 1}:${item.column}`;
    } else if (item.urlProvider === 'comment' && sourceMappedOriginalLocation) {
      element = this._renderText(`${sourceMappedOriginalLocation} (from source map)`);
      element.title = `${generatedLocation} (from sourceURL)`;
    } else if (item.urlProvider === 'comment' && !sourceMappedOriginalLocation) {
      element = this._renderText(`${generatedLocation} (from sourceURL)`);
    } else {
      return null;
    }

    element.classList.add('lh-source-location');
    element.setAttribute('data-source-url', item.url);
    // DevTools expects zero-indexed lines.
    element.setAttribute('data-source-line', String(item.line));
    element.setAttribute('data-source-column', String(item.column));

    return element;
  }

  /**
   * @param {LH.Audit.Details.Filmstrip} details
   * @return {Element}
   */
  _renderFilmstrip(details) {
    const filmstripEl = this._dom.createElement('div', 'lh-filmstrip');

    for (const thumbnail of details.items) {
      const frameEl = this._dom.createChildOf(filmstripEl, 'div', 'lh-filmstrip__frame');
      const imgEl = this._dom.createChildOf(frameEl, 'img', 'lh-filmstrip__thumbnail');
      imgEl.src = thumbnail.data;
      imgEl.alt = `Screenshot`;
    }
    return filmstripEl;
  }

  /**
   * @param {string} text
   * @return {Element}
   */
  _renderCode(text) {
    const pre = this._dom.createElement('pre', 'lh-code');
    pre.textContent = text;
    return pre;
  }
}

/**
 * @license Copyright 2020 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */

// Not named `NBSP` because that creates a duplicate identifier (util.js).
const NBSP2 = '\xa0';
const KiB = 1024;
const MiB = KiB * KiB;

/**
 * @template T
 */
class I18n {
  /**
   * @param {LH.Locale} locale
   * @param {T} strings
   */
  constructor(locale, strings) {
    // When testing, use a locale with more exciting numeric formatting.
    if (locale === 'en-XA') locale = 'de';

    this._numberDateLocale = locale;
    this._numberFormatter = new Intl.NumberFormat(locale);
    this._percentFormatter = new Intl.NumberFormat(locale, {style: 'percent'});
    this._strings = strings;
  }

  get strings() {
    return this._strings;
  }

  /**
   * Format number.
   * @param {number} number
   * @param {number=} granularity Number of decimal places to include. Defaults to 0.1.
   * @return {string}
   */
  formatNumber(number, granularity = 0.1) {
    const coarseValue = Math.round(number / granularity) * granularity;
    return this._numberFormatter.format(coarseValue);
  }

  /**
   * Format percent.
   * @param {number} number 0–1
   * @return {string}
   */
  formatPercent(number) {
    return this._percentFormatter.format(number);
  }

  /**
   * @param {number} size
   * @param {number=} granularity Controls how coarse the displayed value is, defaults to 0.1
   * @return {string}
   */
  formatBytesToKiB(size, granularity = 0.1) {
    const formatter = this._byteFormatterForGranularity(granularity);
    const kbs = formatter.format(Math.round(size / 1024 / granularity) * granularity);
    return `${kbs}${NBSP2}KiB`;
  }

  /**
   * @param {number} size
   * @param {number=} granularity Controls how coarse the displayed value is, defaults to 0.1
   * @return {string}
   */
  formatBytesToMiB(size, granularity = 0.1) {
    const formatter = this._byteFormatterForGranularity(granularity);
    const kbs = formatter.format(Math.round(size / (1024 ** 2) / granularity) * granularity);
    return `${kbs}${NBSP2}MiB`;
  }

  /**
   * @param {number} size
   * @param {number=} granularity Controls how coarse the displayed value is, defaults to 1
   * @return {string}
   */
  formatBytes(size, granularity = 1) {
    const formatter = this._byteFormatterForGranularity(granularity);
    const kbs = formatter.format(Math.round(size / granularity) * granularity);
    return `${kbs}${NBSP2}bytes`;
  }

  /**
   * @param {number} size
   * @param {number=} granularity Controls how coarse the displayed value is, defaults to 0.1
   * @return {string}
   */
  formatBytesWithBestUnit(size, granularity = 0.1) {
    if (size >= MiB) return this.formatBytesToMiB(size, granularity);
    if (size >= KiB) return this.formatBytesToKiB(size, granularity);
    return this.formatNumber(size, granularity) + '\xa0B';
  }

  /**
   * Format bytes with a constant number of fractional digits, i.e. for a granularity of 0.1, 10 becomes '10.0'
   * @param {number} granularity Controls how coarse the displayed value is
   * @return {Intl.NumberFormat}
   */
  _byteFormatterForGranularity(granularity) {
    // assume any granularity above 1 will not contain fractional parts, i.e. will never be 1.5
    let numberOfFractionDigits = 0;
    if (granularity < 1) {
      numberOfFractionDigits = -Math.floor(Math.log10(granularity));
    }

    return new Intl.NumberFormat(this._numberDateLocale, {
      ...this._numberFormatter.resolvedOptions(),
      maximumFractionDigits: numberOfFractionDigits,
      minimumFractionDigits: numberOfFractionDigits,
    });
  }

  /**
   * @param {number} ms
   * @param {number=} granularity Controls how coarse the displayed value is, defaults to 10
   * @return {string}
   */
  formatMilliseconds(ms, granularity = 10) {
    const coarseTime = Math.round(ms / granularity) * granularity;
    return coarseTime === 0
      ? `${this._numberFormatter.format(0)}${NBSP2}ms`
      : `${this._numberFormatter.format(coarseTime)}${NBSP2}ms`;
  }

  /**
   * @param {number} ms
   * @param {number=} granularity Controls how coarse the displayed value is, defaults to 0.1
   * @return {string}
   */
  formatSeconds(ms, granularity = 0.1) {
    const coarseTime = Math.round(ms / 1000 / granularity) * granularity;
    return `${this._numberFormatter.format(coarseTime)}${NBSP2}s`;
  }

  /**
   * Format time.
   * @param {string} date
   * @return {string}
   */
  formatDateTime(date) {
    /** @type {Intl.DateTimeFormatOptions} */
    const options = {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: 'numeric', timeZoneName: 'short',
    };

    // Force UTC if runtime timezone could not be detected.
    // See https://github.com/GoogleChrome/lighthouse/issues/1056
    // and https://github.com/GoogleChrome/lighthouse/pull/9822
    let formatter;
    try {
      formatter = new Intl.DateTimeFormat(this._numberDateLocale, options);
    } catch (err) {
      options.timeZone = 'UTC';
      formatter = new Intl.DateTimeFormat(this._numberDateLocale, options);
    }

    return formatter.format(new Date(date));
  }

  /**
   * Converts a time in milliseconds into a duration string, i.e. `1d 2h 13m 52s`
   * @param {number} timeInMilliseconds
   * @return {string}
   */
  formatDuration(timeInMilliseconds) {
    let timeInSeconds = timeInMilliseconds / 1000;
    if (Math.round(timeInSeconds) === 0) {
      return 'None';
    }

    /** @type {Array<string>} */
    const parts = [];
    /** @type {Record<string, number>} */
    const unitLabels = {
      d: 60 * 60 * 24,
      h: 60 * 60,
      m: 60,
      s: 1,
    };

    Object.keys(unitLabels).forEach(label => {
      const unit = unitLabels[label];
      const numberOfUnits = Math.floor(timeInSeconds / unit);
      if (numberOfUnits > 0) {
        timeInSeconds -= numberOfUnits * unit;
        parts.push(`${numberOfUnits}\xa0${label}`);
      }
    });

    return parts.join(' ');
  }
}

/**
 * @license
 * Copyright 2018 The Lighthouse Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

class PerformanceCategoryRenderer extends CategoryRenderer {
  /**
   * @param {LH.ReportResult.AuditRef} audit
   * @return {!Element}
   */
  _renderMetric(audit) {
    const tmpl = this.dom.createComponent('metric');
    const element = this.dom.find('.lh-metric', tmpl);
    element.id = audit.result.id;
    const rating = Util.calculateRating(audit.result.score, audit.result.scoreDisplayMode);
    element.classList.add(`lh-metric--${rating}`);

    const titleEl = this.dom.find('.lh-metric__title', tmpl);
    titleEl.textContent = audit.result.title;

    const valueEl = this.dom.find('.lh-metric__value', tmpl);
    valueEl.textContent = audit.result.displayValue || '';

    const descriptionEl = this.dom.find('.lh-metric__description', tmpl);
    descriptionEl.appendChild(this.dom.convertMarkdownLinkSnippets(audit.result.description));

    if (audit.result.scoreDisplayMode === 'error') {
      descriptionEl.textContent = '';
      valueEl.textContent = 'Error!';
      const tooltip = this.dom.createChildOf(descriptionEl, 'span');
      tooltip.textContent = audit.result.errorMessage || 'Report error: no metric information';
    } else if (audit.result.scoreDisplayMode === 'notApplicable') {
      valueEl.textContent = '--';
    }

    return element;
  }

  /**
   * @param {LH.ReportResult.AuditRef} audit
   * @param {number} scale
   * @return {!Element}
   */
  _renderOpportunity(audit, scale) {
    const oppTmpl = this.dom.createComponent('opportunity');
    const element = this.populateAuditValues(audit, oppTmpl);
    element.id = audit.result.id;

    if (!audit.result.details || audit.result.scoreDisplayMode === 'error') {
      return element;
    }
    const details = audit.result.details;
    if (details.type !== 'opportunity') {
      return element;
    }

    // Overwrite the displayValue with opportunity's wastedMs
    // TODO: normalize this to one tagName.
    const displayEl =
      this.dom.find('span.lh-audit__display-text, div.lh-audit__display-text', element);
    const sparklineWidthPct = `${details.overallSavingsMs / scale * 100}%`;
    this.dom.find('div.lh-sparkline__bar', element).style.width = sparklineWidthPct;
    displayEl.textContent = Util.i18n.formatSeconds(details.overallSavingsMs, 0.01);

    // Set [title] tooltips
    if (audit.result.displayValue) {
      const displayValue = audit.result.displayValue;
      this.dom.find('div.lh-load-opportunity__sparkline', element).title = displayValue;
      displayEl.title = displayValue;
    }

    return element;
  }

  /**
   * Get an audit's wastedMs to sort the opportunity by, and scale the sparkline width
   * Opportunities with an error won't have a details object, so MIN_VALUE is returned to keep any
   * erroring opportunities last in sort order.
   * @param {LH.ReportResult.AuditRef} audit
   * @return {number}
   */
  _getWastedMs(audit) {
    if (audit.result.details && audit.result.details.type === 'opportunity') {
      const details = audit.result.details;
      if (typeof details.overallSavingsMs !== 'number') {
        throw new Error('non-opportunity details passed to _getWastedMs');
      }
      return details.overallSavingsMs;
    } else {
      return Number.MIN_VALUE;
    }
  }

  /**
   * Get a link to the interactive scoring calculator with the metric values.
   * @param {LH.ReportResult.AuditRef[]} auditRefs
   * @return {string}
   */
  _getScoringCalculatorHref(auditRefs) {
    // TODO: filter by !!acronym when dropping renderer support of v7 LHRs.
    const metrics = auditRefs.filter(audit => audit.group === 'metrics');
    const fci = auditRefs.find(audit => audit.id === 'first-cpu-idle');
    const fmp = auditRefs.find(audit => audit.id === 'first-meaningful-paint');
    if (fci) metrics.push(fci);
    if (fmp) metrics.push(fmp);

    /**
     * Clamp figure to 2 decimal places
     * @param {number} val
     * @return {number}
     */
    const clampTo2Decimals = val => Math.round(val * 100) / 100;

    const metricPairs = metrics.map(audit => {
      let value;
      if (typeof audit.result.numericValue === 'number') {
        value = audit.id === 'cumulative-layout-shift' ?
          clampTo2Decimals(audit.result.numericValue) :
          Math.round(audit.result.numericValue);
        value = value.toString();
      } else {
        value = 'null';
      }
      return [audit.acronym || audit.id, value];
    });
    const paramPairs = [...metricPairs];

    if (Util.reportJson) {
      paramPairs.push(['device', Util.reportJson.configSettings.formFactor]);
      paramPairs.push(['version', Util.reportJson.lighthouseVersion]);
    }

    const params = new URLSearchParams(paramPairs);
    const url = new URL('https://googlechrome.github.io/lighthouse/scorecalc/');
    url.hash = params.toString();
    return url.href;
  }

  /**
   * For performance, audits with no group should be a diagnostic or opportunity.
   * The audit details type will determine which of the two groups an audit is in.
   *
   * @param {LH.ReportResult.AuditRef} audit
   * @return {'load-opportunity'|'diagnostic'|null}
   */
  _classifyPerformanceAudit(audit) {
    if (audit.group) return null;
    if (audit.result.details && audit.result.details.type === 'opportunity') {
      return 'load-opportunity';
    }
    return 'diagnostic';
  }

  /**
   * @param {LH.ReportResult.Category} category
   * @param {Object<string, LH.Result.ReportGroup>} groups
   * @param {{gatherMode: LH.Result.GatherMode}=} options
   * @return {Element}
   * @override
   */
  render(category, groups, options) {
    const strings = Util.i18n.strings;
    const element = this.dom.createElement('div', 'lh-category');
    element.id = category.id;
    element.appendChild(this.renderCategoryHeader(category, groups, options));

    // Metrics.
    const metricAudits = category.auditRefs.filter(audit => audit.group === 'metrics');
    if (metricAudits.length) {
      const [metricsGroupEl, metricsFooterEl] = this.renderAuditGroup(groups.metrics);

      // Metric descriptions toggle.
      const checkboxEl = this.dom.createElement('input', 'lh-metrics-toggle__input');
      const checkboxId = `lh-metrics-toggle${Util.getUniqueSuffix()}`;
      checkboxEl.setAttribute('aria-label', 'Toggle the display of metric descriptions');
      checkboxEl.type = 'checkbox';
      checkboxEl.id = checkboxId;
      metricsGroupEl.prepend(checkboxEl);
      const metricHeaderEl = this.dom.find('.lh-audit-group__header', metricsGroupEl);
      const labelEl = this.dom.createChildOf(metricHeaderEl, 'label', 'lh-metrics-toggle__label');
      labelEl.htmlFor = checkboxId;
      const showEl = this.dom.createChildOf(labelEl, 'span', 'lh-metrics-toggle__labeltext--show');
      const hideEl = this.dom.createChildOf(labelEl, 'span', 'lh-metrics-toggle__labeltext--hide');
      showEl.textContent = Util.i18n.strings.expandView;
      hideEl.textContent = Util.i18n.strings.collapseView;

      const metricsBoxesEl = this.dom.createElement('div', 'lh-metrics-container');
      metricsGroupEl.insertBefore(metricsBoxesEl, metricsFooterEl);
      metricAudits.forEach(item => {
        metricsBoxesEl.appendChild(this._renderMetric(item));
      });

      // Only add the disclaimer with the score calculator link if the category was rendered with a score gauge.
      if (element.querySelector('.lh-gauge__wrapper')) {
        const descriptionEl = this.dom.find('.lh-category-header__description', element);
        const estValuesEl = this.dom.createChildOf(descriptionEl, 'div', 'lh-metrics__disclaimer');
        const disclaimerEl = this.dom.convertMarkdownLinkSnippets(strings.varianceDisclaimer);
        estValuesEl.appendChild(disclaimerEl);

        // Add link to score calculator.
        const calculatorLink = this.dom.createChildOf(estValuesEl, 'a', 'lh-calclink');
        calculatorLink.target = '_blank';
        calculatorLink.textContent = strings.calculatorLink;
        this.dom.safelySetHref(calculatorLink, this._getScoringCalculatorHref(category.auditRefs));
      }

      metricsGroupEl.classList.add('lh-audit-group--metrics');
      element.appendChild(metricsGroupEl);
    }

    // Filmstrip
    const timelineEl = this.dom.createChildOf(element, 'div', 'lh-filmstrip-container');
    const thumbnailAudit = category.auditRefs.find(audit => audit.id === 'screenshot-thumbnails');
    const thumbnailResult = thumbnailAudit?.result;
    if (thumbnailResult?.details) {
      timelineEl.id = thumbnailResult.id;
      const filmstripEl = this.detailsRenderer.render(thumbnailResult.details);
      filmstripEl && timelineEl.appendChild(filmstripEl);
    }

    // Opportunities
    const opportunityAudits = category.auditRefs
        .filter(audit => this._classifyPerformanceAudit(audit) === 'load-opportunity')
        .filter(audit => !Util.showAsPassed(audit.result))
        .sort((auditA, auditB) => this._getWastedMs(auditB) - this._getWastedMs(auditA));

    const filterableMetrics = metricAudits.filter(a => !!a.relevantAudits);
    // TODO: only add if there are opportunities & diagnostics rendered.
    if (filterableMetrics.length) {
      this.renderMetricAuditFilter(filterableMetrics, element);
    }

    if (opportunityAudits.length) {
      // Scale the sparklines relative to savings, minimum 2s to not overstate small savings
      const minimumScale = 2000;
      const wastedMsValues = opportunityAudits.map(audit => this._getWastedMs(audit));
      const maxWaste = Math.max(...wastedMsValues);
      const scale = Math.max(Math.ceil(maxWaste / 1000) * 1000, minimumScale);
      const [groupEl, footerEl] = this.renderAuditGroup(groups['load-opportunities']);
      const tmpl = this.dom.createComponent('opportunityHeader');

      this.dom.find('.lh-load-opportunity__col--one', tmpl).textContent =
        strings.opportunityResourceColumnLabel;
      this.dom.find('.lh-load-opportunity__col--two', tmpl).textContent =
        strings.opportunitySavingsColumnLabel;

      const headerEl = this.dom.find('.lh-load-opportunity__header', tmpl);
      groupEl.insertBefore(headerEl, footerEl);
      opportunityAudits.forEach(item =>
        groupEl.insertBefore(this._renderOpportunity(item, scale), footerEl));
      groupEl.classList.add('lh-audit-group--load-opportunities');
      element.appendChild(groupEl);
    }

    // Diagnostics
    const diagnosticAudits = category.auditRefs
        .filter(audit => this._classifyPerformanceAudit(audit) === 'diagnostic')
        .filter(audit => !Util.showAsPassed(audit.result))
        .sort((a, b) => {
          const scoreA = a.result.scoreDisplayMode === 'informative' ? 100 : Number(a.result.score);
          const scoreB = b.result.scoreDisplayMode === 'informative' ? 100 : Number(b.result.score);
          return scoreA - scoreB;
        });

    if (diagnosticAudits.length) {
      const [groupEl, footerEl] = this.renderAuditGroup(groups['diagnostics']);
      diagnosticAudits.forEach(item => groupEl.insertBefore(this.renderAudit(item), footerEl));
      groupEl.classList.add('lh-audit-group--diagnostics');
      element.appendChild(groupEl);
    }

    // Passed audits
    const passedAudits = category.auditRefs
        .filter(audit => this._classifyPerformanceAudit(audit) && Util.showAsPassed(audit.result));

    if (!passedAudits.length) return element;

    const clumpOpts = {
      auditRefs: passedAudits,
      groupDefinitions: groups,
    };
    const passedElem = this.renderClump('passed', clumpOpts);
    element.appendChild(passedElem);

    // Budgets
    /** @type {Array<Element>} */
    const budgetTableEls = [];
    ['performance-budget', 'timing-budget'].forEach((id) => {
      const audit = category.auditRefs.find(audit => audit.id === id);
      if (audit?.result.details) {
        const table = this.detailsRenderer.render(audit.result.details);
        if (table) {
          table.id = id;
          table.classList.add('lh-details', 'lh-details--budget', 'lh-audit');
          budgetTableEls.push(table);
        }
      }
    });
    if (budgetTableEls.length > 0) {
      const [groupEl, footerEl] = this.renderAuditGroup(groups.budgets);
      budgetTableEls.forEach(table => groupEl.insertBefore(table, footerEl));
      groupEl.classList.add('lh-audit-group--budgets');
      element.appendChild(groupEl);
    }

    return element;
  }

  /**
   * Render the control to filter the audits by metric. The filtering is done at runtime by CSS only
   * @param {LH.ReportResult.AuditRef[]} filterableMetrics
   * @param {HTMLDivElement} categoryEl
   */
  renderMetricAuditFilter(filterableMetrics, categoryEl) {
    const metricFilterEl = this.dom.createElement('div', 'lh-metricfilter');
    const textEl = this.dom.createChildOf(metricFilterEl, 'span', 'lh-metricfilter__text');
    textEl.textContent = Util.i18n.strings.showRelevantAudits;

    const filterChoices = /** @type {LH.ReportResult.AuditRef[]} */ ([
      ({acronym: 'All'}),
      ...filterableMetrics,
    ]);

    // Form labels need to reference unique IDs, but multiple reports rendered in the same DOM (eg PSI)
    // would mean ID conflict.  To address this, we 'scope' these radio inputs with a unique suffix.
    const uniqSuffix = Util.getUniqueSuffix();
    for (const metric of filterChoices) {
      const elemId = `metric-${metric.acronym}-${uniqSuffix}`;
      const radioEl = this.dom.createChildOf(metricFilterEl, 'input', 'lh-metricfilter__radio');
      radioEl.type = 'radio';
      radioEl.name = `metricsfilter-${uniqSuffix}`;
      radioEl.id = elemId;

      const labelEl = this.dom.createChildOf(metricFilterEl, 'label', 'lh-metricfilter__label');
      labelEl.htmlFor = elemId;
      labelEl.title = metric.result?.title;
      labelEl.textContent = metric.acronym || metric.id;

      if (metric.acronym === 'All') {
        radioEl.checked = true;
        labelEl.classList.add('lh-metricfilter__label--active');
      }
      categoryEl.append(metricFilterEl);

      // Toggle class/hidden state based on filter choice.
      radioEl.addEventListener('input', _ => {
        for (const elem of categoryEl.querySelectorAll('label.lh-metricfilter__label')) {
          elem.classList.toggle('lh-metricfilter__label--active', elem.htmlFor === elemId);
        }
        categoryEl.classList.toggle('lh-category--filtered', metric.acronym !== 'All');

        for (const perfAuditEl of categoryEl.querySelectorAll('div.lh-audit')) {
          if (metric.acronym === 'All') {
            perfAuditEl.hidden = false;
            continue;
          }

          perfAuditEl.hidden = true;
          if (metric.relevantAudits && metric.relevantAudits.includes(perfAuditEl.id)) {
            perfAuditEl.hidden = false;
          }
        }

        // Hide groups/clumps if all child audits are also hidden.
        const groupEls = categoryEl.querySelectorAll('div.lh-audit-group, details.lh-audit-group');
        for (const groupEl of groupEls) {
          groupEl.hidden = false;
          const childEls = Array.from(groupEl.querySelectorAll('div.lh-audit'));
          const areAllHidden = !!childEls.length && childEls.every(auditEl => auditEl.hidden);
          groupEl.hidden = areAllHidden;
        }
      });
    }
  }
}

/**
 * @license
 * Copyright 2018 The Lighthouse Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

class PwaCategoryRenderer extends CategoryRenderer {
  /**
   * @param {LH.ReportResult.Category} category
   * @param {Object<string, LH.Result.ReportGroup>} [groupDefinitions]
   * @return {Element}
   */
  render(category, groupDefinitions = {}) {
    const categoryElem = this.dom.createElement('div', 'lh-category');
    categoryElem.id = category.id;
    categoryElem.appendChild(this.renderCategoryHeader(category, groupDefinitions));

    const auditRefs = category.auditRefs;

    // Regular audits aren't split up into pass/fail/notApplicable clumps, they're
    // all put in a top-level clump that isn't expandable/collapsible.
    const regularAuditRefs = auditRefs.filter(ref => ref.result.scoreDisplayMode !== 'manual');
    const auditsElem = this._renderAudits(regularAuditRefs, groupDefinitions);
    categoryElem.appendChild(auditsElem);

    // Manual audits are still in a manual clump.
    const manualAuditRefs = auditRefs.filter(ref => ref.result.scoreDisplayMode === 'manual');
    const manualElem = this.renderClump('manual',
      {auditRefs: manualAuditRefs, description: category.manualDescription});
    categoryElem.appendChild(manualElem);

    return categoryElem;
  }

  /**
   * @param {LH.ReportResult.Category} category
   * @param {Record<string, LH.Result.ReportGroup>} groupDefinitions
   * @return {DocumentFragment}
   */
  renderCategoryScore(category, groupDefinitions) {
    // Defer to parent-gauge style if category error.
    if (category.score === null) {
      return super.renderScoreGauge(category, groupDefinitions);
    }

    const tmpl = this.dom.createComponent('gaugePwa');
    const wrapper = this.dom.find('a.lh-gauge--pwa__wrapper', tmpl);

    // Correct IDs in case multiple instances end up in the page.
    const svgRoot = tmpl.querySelector('svg');
    if (!svgRoot) throw new Error('no SVG element found in PWA score gauge template');
    PwaCategoryRenderer._makeSvgReferencesUnique(svgRoot);

    const allGroups = this._getGroupIds(category.auditRefs);
    const passingGroupIds = this._getPassingGroupIds(category.auditRefs);

    if (passingGroupIds.size === allGroups.size) {
      wrapper.classList.add('lh-badged--all');
    } else {
      for (const passingGroupId of passingGroupIds) {
        wrapper.classList.add(`lh-badged--${passingGroupId}`);
      }
    }

    this.dom.find('.lh-gauge__label', tmpl).textContent = category.title;
    wrapper.title = this._getGaugeTooltip(category.auditRefs, groupDefinitions);
    return tmpl;
  }

  /**
   * Returns the group IDs found in auditRefs.
   * @param {Array<LH.ReportResult.AuditRef>} auditRefs
   * @return {!Set<string>}
   */
  _getGroupIds(auditRefs) {
    const groupIds = auditRefs.map(ref => ref.group).filter(/** @return {g is string} */ g => !!g);
    return new Set(groupIds);
  }

  /**
   * Returns the group IDs whose audits are all considered passing.
   * @param {Array<LH.ReportResult.AuditRef>} auditRefs
   * @return {Set<string>}
   */
  _getPassingGroupIds(auditRefs) {
    const uniqueGroupIds = this._getGroupIds(auditRefs);

    // Remove any that have a failing audit.
    for (const auditRef of auditRefs) {
      if (!Util.showAsPassed(auditRef.result) && auditRef.group) {
        uniqueGroupIds.delete(auditRef.group);
      }
    }

    return uniqueGroupIds;
  }

  /**
   * Returns a tooltip string summarizing group pass rates.
   * @param {Array<LH.ReportResult.AuditRef>} auditRefs
   * @param {Record<string, LH.Result.ReportGroup>} groupDefinitions
   * @return {string}
   */
  _getGaugeTooltip(auditRefs, groupDefinitions) {
    const groupIds = this._getGroupIds(auditRefs);

    const tips = [];
    for (const groupId of groupIds) {
      const groupAuditRefs = auditRefs.filter(ref => ref.group === groupId);
      const auditCount = groupAuditRefs.length;
      const passedCount = groupAuditRefs.filter(ref => Util.showAsPassed(ref.result)).length;

      const title = groupDefinitions[groupId].title;
      tips.push(`${title}: ${passedCount}/${auditCount}`);
    }

    return tips.join(', ');
  }

  /**
   * Render non-manual audits in groups, giving a badge to any group that has
   * all passing audits.
   * @param {Array<LH.ReportResult.AuditRef>} auditRefs
   * @param {Object<string, LH.Result.ReportGroup>} groupDefinitions
   * @return {Element}
   */
  _renderAudits(auditRefs, groupDefinitions) {
    const auditsElem = this.renderUnexpandableClump(auditRefs, groupDefinitions);

    // Add a 'badged' class to group if all audits in that group pass.
    const passsingGroupIds = this._getPassingGroupIds(auditRefs);
    for (const groupId of passsingGroupIds) {
      const groupElem = this.dom.find(`.lh-audit-group--${groupId}`, auditsElem);
      groupElem.classList.add('lh-badged');
    }

    return auditsElem;
  }

  /**
   * Alters SVG id references so multiple instances of an SVG element can coexist
   * in a single page. If `svgRoot` has a `<defs>` block, gives all elements defined
   * in it unique ids, then updates id references (`<use xlink:href="...">`,
   * `fill="url(#...)"`) to the altered ids in all descendents of `svgRoot`.
   * @param {SVGElement} svgRoot
   */
  static _makeSvgReferencesUnique(svgRoot) {
    const defsEl = svgRoot.querySelector('defs');
    if (!defsEl) return;

    const idSuffix = Util.getUniqueSuffix();
    const elementsToUpdate = defsEl.querySelectorAll('[id]');
    for (const el of elementsToUpdate) {
      const oldId = el.id;
      const newId = `${oldId}-${idSuffix}`;
      el.id = newId;

      // Update all <use>s.
      const useEls = svgRoot.querySelectorAll(`use[href="#${oldId}"]`);
      for (const useEl of useEls) {
        useEl.setAttribute('href', `#${newId}`);
      }

      // Update all fill="url(#...)"s.
      const fillEls = svgRoot.querySelectorAll(`[fill="url(#${oldId})"]`);
      for (const fillEl of fillEls) {
        fillEl.setAttribute('fill', `url(#${newId})`);
      }
    }
  }
}

/**
 * @license
 * Copyright 2017 The Lighthouse Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Dummy text for ensuring report robustness: </script> pre$`post %%LIGHTHOUSE_JSON%%
 * (this is handled by terser)
 */


class ReportRenderer {
  /**
   * @param {DOM} dom
   */
  constructor(dom) {
    /** @type {DOM} */
    this._dom = dom;
    /** @type {LH.Renderer.Options} */
    this._opts = {};
  }

  /**
   * @param {LH.Result} lhr
   * @param {HTMLElement?} rootEl Report root element containing the report
   * @param {LH.Renderer.Options=} opts
   * @return {!Element}
   */
  renderReport(lhr, rootEl, opts) {
    // Allow legacy report rendering API
    if (!this._dom.rootEl && rootEl) {
      console.warn('Please adopt the new report API in renderer/api.js.');
      const closestRoot = rootEl.closest('.lh-root');
      if (closestRoot) {
        this._dom.rootEl = /** @type {HTMLElement} */ (closestRoot);
      } else {
        rootEl.classList.add('lh-root', 'lh-vars');
        this._dom.rootEl = rootEl;
      }
    } else if (this._dom.rootEl && rootEl) {
      // Handle legacy flow-report case
      this._dom.rootEl = rootEl;
    }
    if (opts) {
      this._opts = opts;
    }

    this._dom.setLighthouseChannel(lhr.configSettings.channel || 'unknown');

    const report = Util.prepareReportResult(lhr);

    this._dom.rootEl.textContent = ''; // Remove previous report.
    this._dom.rootEl.appendChild(this._renderReport(report));

    return this._dom.rootEl;
  }

  /**
   * @param {LH.ReportResult} report
   * @return {DocumentFragment}
   */
  _renderReportTopbar(report) {
    const el = this._dom.createComponent('topbar');
    const metadataUrl = this._dom.find('a.lh-topbar__url', el);
    metadataUrl.textContent = report.finalUrl;
    metadataUrl.title = report.finalUrl;
    this._dom.safelySetHref(metadataUrl, report.finalUrl);
    return el;
  }

  /**
   * @return {DocumentFragment}
   */
  _renderReportHeader() {
    const el = this._dom.createComponent('heading');
    const domFragment = this._dom.createComponent('scoresWrapper');
    const placeholder = this._dom.find('.lh-scores-wrapper-placeholder', el);
    placeholder.replaceWith(domFragment);
    return el;
  }

  /**
   * @param {LH.ReportResult} report
   * @return {DocumentFragment}
   */
  _renderReportFooter(report) {
    const footer = this._dom.createComponent('footer');

    this._renderMetaBlock(report, footer);

    this._dom.find('.lh-footer__version_issue', footer).textContent = Util.i18n.strings.footerIssue;
    this._dom.find('.lh-footer__version', footer).textContent = report.lighthouseVersion;
    return footer;
  }

  /**
   * @param {LH.ReportResult} report
   * @param {DocumentFragment} footer
   */
  _renderMetaBlock(report, footer) {
    const envValues = Util.getEmulationDescriptions(report.configSettings || {});


    const match = report.userAgent.match(/(\w*Chrome\/[\d.]+)/); // \w* to include 'HeadlessChrome'
    const chromeVer = Array.isArray(match)
      ? match[1].replace('/', ' ').replace('Chrome', 'Chromium')
      : 'Chromium';
    const channel = report.configSettings.channel;
    const benchmarkIndex = report.environment.benchmarkIndex.toFixed(0);
    const axeVersion = report.environment.credits?.['axe-core'];

    // [CSS icon class, textContent, tooltipText]
    const metaItems = [
      ['date',
        `Captured at ${Util.i18n.formatDateTime(report.fetchTime)}`],
      ['devices',
        `${envValues.deviceEmulation} with Lighthouse ${report.lighthouseVersion}`,
        `${Util.i18n.strings.runtimeSettingsBenchmark}: ${benchmarkIndex}` +
            `\n${Util.i18n.strings.runtimeSettingsCPUThrottling}: ${envValues.cpuThrottling}` +
            (axeVersion ? `\n${Util.i18n.strings.runtimeSettingsAxeVersion}: ${axeVersion}` : '')],
      ['samples-one',
        Util.i18n.strings.runtimeSingleLoad,
        Util.i18n.strings.runtimeSingleLoadTooltip],
      ['stopwatch',
        Util.i18n.strings.runtimeAnalysisWindow],
      ['networkspeed',
        `${envValues.summary}`,
        `${Util.i18n.strings.runtimeSettingsNetworkThrottling}: ${envValues.networkThrottling}`],
      ['chrome',
        `Using ${chromeVer}` + (channel ? ` with ${channel}` : ''),
        `${Util.i18n.strings.runtimeSettingsUANetwork}: "${report.environment.networkUserAgent}"`],
    ];

    const metaItemsEl = this._dom.find('.lh-meta__items', footer);
    for (const [iconname, text, tooltip] of metaItems) {
      const itemEl = this._dom.createChildOf(metaItemsEl, 'li', 'lh-meta__item');
      itemEl.textContent = text;
      if (tooltip) {
        itemEl.classList.add('lh-tooltip-boundary');
        const tooltipEl = this._dom.createChildOf(itemEl, 'div', 'lh-tooltip');
        tooltipEl.textContent = tooltip;
      }
      itemEl.classList.add('lh-report-icon', `lh-report-icon--${iconname}`);
    }
  }

  /**
   * Returns a div with a list of top-level warnings, or an empty div if no warnings.
   * @param {LH.ReportResult} report
   * @return {Node}
   */
  _renderReportWarnings(report) {
    if (!report.runWarnings || report.runWarnings.length === 0) {
      return this._dom.createElement('div');
    }

    const container = this._dom.createComponent('warningsToplevel');
    const message = this._dom.find('.lh-warnings__msg', container);
    message.textContent = Util.i18n.strings.toplevelWarningsMessage;

    const warnings = this._dom.find('ul', container);
    for (const warningString of report.runWarnings) {
      const warning = warnings.appendChild(this._dom.createElement('li'));
      warning.appendChild(this._dom.convertMarkdownLinkSnippets(warningString));
    }

    return container;
  }

  /**
   * @param {LH.ReportResult} report
   * @param {CategoryRenderer} categoryRenderer
   * @param {Record<string, CategoryRenderer>} specificCategoryRenderers
   * @return {!DocumentFragment[]}
   */
  _renderScoreGauges(report, categoryRenderer, specificCategoryRenderers) {
    // Group gauges in this order: default, pwa, plugins.
    const defaultGauges = [];
    const customGauges = []; // PWA.
    const pluginGauges = [];

    for (const category of Object.values(report.categories)) {
      const renderer = specificCategoryRenderers[category.id] || categoryRenderer;
      const categoryGauge = renderer.renderCategoryScore(
        category,
        report.categoryGroups || {},
        {gatherMode: report.gatherMode}
      );

      const gaugeWrapperEl = this._dom.find('a.lh-gauge__wrapper, a.lh-fraction__wrapper',
        categoryGauge);
      if (gaugeWrapperEl) {
        this._dom.safelySetHref(gaugeWrapperEl, `#${category.id}`);
        // Handle navigation clicks by scrolling to target without changing the page's URL.
        // Why? Some report embedding clients have their own routing and updating the location.hash
        // can introduce problems. Others may have an unpredictable `<base>` URL which ensures
        // navigation to `${baseURL}#categoryid` will be unintended.
        gaugeWrapperEl.addEventListener('click', e => {
          if (!gaugeWrapperEl.matches('[href^="#"]')) return;
          const selector = gaugeWrapperEl.getAttribute('href');
          const reportRoot = this._dom.rootEl;
          if (!selector || !reportRoot) return;
          const destEl = this._dom.find(selector, reportRoot);
          e.preventDefault();
          destEl.scrollIntoView();
        });
        this._opts.onPageAnchorRendered?.(gaugeWrapperEl);
      }


      if (Util.isPluginCategory(category.id)) {
        pluginGauges.push(categoryGauge);
      } else if (renderer.renderCategoryScore === categoryRenderer.renderCategoryScore) {
        // The renderer for default categories is just the default CategoryRenderer.
        // If the functions are equal, then renderer is an instance of CategoryRenderer.
        // For example, the PWA category uses PwaCategoryRenderer, which overrides
        // CategoryRenderer.renderCategoryScore, so it would fail this check and be placed
        // in the customGauges bucket.
        defaultGauges.push(categoryGauge);
      } else {
        customGauges.push(categoryGauge);
      }
    }

    return [...defaultGauges, ...customGauges, ...pluginGauges];
  }

  /**
   * @param {LH.ReportResult} report
   * @return {!DocumentFragment}
   */
  _renderReport(report) {
    const i18n = new I18n(report.configSettings.locale, {
      // Set missing renderer strings to default (english) values.
      ...Util.UIStrings,
      ...report.i18n.rendererFormattedStrings,
    });
    Util.i18n = i18n;
    Util.reportJson = report;

    const fullPageScreenshot =
      report.audits['full-page-screenshot']?.details &&
      report.audits['full-page-screenshot'].details.type === 'full-page-screenshot' ?
      report.audits['full-page-screenshot'].details : undefined;
    const detailsRenderer = new DetailsRenderer(this._dom, {
      fullPageScreenshot,
    });

    const categoryRenderer = new CategoryRenderer(this._dom, detailsRenderer);

    /** @type {Record<string, CategoryRenderer>} */
    const specificCategoryRenderers = {
      performance: new PerformanceCategoryRenderer(this._dom, detailsRenderer),
      pwa: new PwaCategoryRenderer(this._dom, detailsRenderer),
    };

    const headerContainer = this._dom.createElement('div');
    headerContainer.appendChild(this._renderReportHeader());

    const reportContainer = this._dom.createElement('div', 'lh-container');
    const reportSection = this._dom.createElement('div', 'lh-report');
    reportSection.appendChild(this._renderReportWarnings(report));

    let scoreHeader;
    const isSoloCategory = Object.keys(report.categories).length === 1;
    if (!isSoloCategory) {
      scoreHeader = this._dom.createElement('div', 'lh-scores-header');
    } else {
      headerContainer.classList.add('lh-header--solo-category');
    }

    const scoreScale = this._dom.createElement('div');
    scoreScale.classList.add('lh-scorescale-wrap');
    scoreScale.append(this._dom.createComponent('scorescale'));
    if (scoreHeader) {
      const scoresContainer = this._dom.find('.lh-scores-container', headerContainer);
      scoreHeader.append(
        ...this._renderScoreGauges(report, categoryRenderer, specificCategoryRenderers));
      scoresContainer.appendChild(scoreHeader);
      scoresContainer.appendChild(scoreScale);

      const stickyHeader = this._dom.createElement('div', 'lh-sticky-header');
      stickyHeader.append(
        ...this._renderScoreGauges(report, categoryRenderer, specificCategoryRenderers));
      reportContainer.appendChild(stickyHeader);
    }

    const categories = reportSection.appendChild(this._dom.createElement('div', 'lh-categories'));
    const categoryOptions = {gatherMode: report.gatherMode};
    for (const category of Object.values(report.categories)) {
      const renderer = specificCategoryRenderers[category.id] || categoryRenderer;
      // .lh-category-wrapper is full-width and provides horizontal rules between categories.
      // .lh-category within has the max-width: var(--report-content-max-width);
      const wrapper = renderer.dom.createChildOf(categories, 'div', 'lh-category-wrapper');
      wrapper.appendChild(renderer.render(
        category,
        report.categoryGroups,
        categoryOptions
      ));
    }

    categoryRenderer.injectFinalScreenshot(categories, report.audits, scoreScale);

    const reportFragment = this._dom.createFragment();
    if (!this._opts.omitGlobalStyles) {
      reportFragment.append(this._dom.createComponent('styles'));
    }

    if (!this._opts.omitTopbar) {
      reportFragment.appendChild(this._renderReportTopbar(report));
    }

    reportFragment.appendChild(reportContainer);
    reportContainer.appendChild(headerContainer);
    reportContainer.appendChild(reportSection);
    reportSection.appendChild(this._renderReportFooter(report));

    if (fullPageScreenshot) {
      ElementScreenshotRenderer.installFullPageScreenshot(
        this._dom.rootEl, fullPageScreenshot.screenshot);
    }

    return reportFragment;
  }
}

/**
 * @license Copyright 2021 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */

/* eslint-env browser */

/** @typedef {import('./dom.js').DOM} DOM */

/**
 * @param {DOM} dom
 * @param {boolean} [force]
 */
function toggleDarkTheme(dom, force) {
  const el = dom.rootEl;
  // This seems unnecessary, but in DevTools, passing "undefined" as the second
  // parameter acts like passing "false".
  // https://github.com/ChromeDevTools/devtools-frontend/blob/dd6a6d4153647c2a4203c327c595692c5e0a4256/front_end/dom_extension/DOMExtension.js#L809-L819
  if (typeof force === 'undefined') {
    el.classList.toggle('lh-dark');
  } else {
    el.classList.toggle('lh-dark', force);
  }
}

/**
 * @license Copyright 2021 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */

/* global CompressionStream */

const btoa_ = typeof btoa !== 'undefined' ?
  btoa :
  /** @param {string} str */
  (str) => Buffer.from(str).toString('base64');
const atob_ = typeof atob !== 'undefined' ?
  atob :
  /** @param {string} str */
  (str) => Buffer.from(str, 'base64').toString();

/**
 * Takes an UTF-8 string and returns a base64 encoded string.
 * If gzip is true, the UTF-8 bytes are gzipped before base64'd, using
 * CompressionStream (currently only in Chrome), falling back to pako
 * (which is only used to encode in our Node tests).
 * @param {string} string
 * @param {{gzip: boolean}} options
 * @return {Promise<string>}
 */
async function toBase64(string, options) {
  let bytes = new TextEncoder().encode(string);

  if (options.gzip) {
    if (typeof CompressionStream !== 'undefined') {
      const cs = new CompressionStream('gzip');
      const writer = cs.writable.getWriter();
      writer.write(bytes);
      writer.close();
      const compAb = await new Response(cs.readable).arrayBuffer();
      bytes = new Uint8Array(compAb);
    } else {
      /** @type {import('pako')=} */
      const pako = window.pako;
      bytes = pako.gzip(string);
    }
  }

  let binaryString = '';
  // This is ~25% faster than building the string one character at a time.
  // https://jsbench.me/2gkoxazvjl
  const chunkSize = 5000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binaryString += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa_(binaryString);
}

/**
 * @param {string} encoded
 * @param {{gzip: boolean}} options
 * @return {string}
 */
function fromBase64(encoded, options) {
  const binaryString = atob_(encoded);
  const bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));

  if (options.gzip) {
    /** @type {import('pako')=} */
    const pako = window.pako;
    return pako.ungzip(bytes, {to: 'string'});
  } else {
    return new TextDecoder().decode(bytes);
  }
}

const TextEncoding = {toBase64, fromBase64};

/**
 * @license
 * Copyright 2021 The Lighthouse Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* eslint-env browser */

function getAppsOrigin() {
  const isVercel = window.location.host.endsWith('.vercel.app');
  const isDev = new URLSearchParams(window.location.search).has('dev');

  if (isVercel) return `https://${window.location.host}/gh-pages`;
  if (isDev) return 'http://localhost:8000';
  return 'https://googlechrome.github.io/lighthouse';
}

/**
 * The popup's window.name is keyed by version+url+fetchTime, so we reuse/select tabs correctly.
 * @param {LH.Result} json
 * @protected
 */
function computeWindowNameSuffix(json) {
  // @ts-expect-error - If this is a v2 LHR, use old `generatedTime`.
  const fallbackFetchTime = /** @type {string} */ (json.generatedTime);
  const fetchTime = json.fetchTime || fallbackFetchTime;
  return `${json.lighthouseVersion}-${json.requestedUrl}-${fetchTime}`;
}

/**
 * Opens a new tab to an external page and sends data using postMessage.
 * @param {{lhr: LH.Result} | LH.Treemap.Options} data
 * @param {string} url
 * @param {string} windowName
 * @protected
 */
function openTabAndSendData(data, url, windowName) {
  const origin = new URL(url).origin;
  // Chrome doesn't allow us to immediately postMessage to a popup right
  // after it's created. Normally, we could also listen for the popup window's
  // load event, however it is cross-domain and won't fire. Instead, listen
  // for a message from the target app saying "I'm open".
  window.addEventListener('message', function msgHandler(messageEvent) {
    if (messageEvent.origin !== origin) {
      return;
    }
    if (popup && messageEvent.data.opened) {
      popup.postMessage(data, origin);
      window.removeEventListener('message', msgHandler);
    }
  });

  const popup = window.open(url, windowName);
}

/**
 * Opens a new tab to an external page and sends data via base64 encoded url params.
 * @param {{lhr: LH.Result} | LH.Treemap.Options} data
 * @param {string} url_
 * @param {string} windowName
 * @protected
 */
async function openTabWithUrlData(data, url_, windowName) {
  const url = new URL(url_);
  const gzip = Boolean(window.CompressionStream);
  url.hash = await TextEncoding.toBase64(JSON.stringify(data), {
    gzip,
  });
  if (gzip) url.searchParams.set('gzip', '1');
  window.open(url.toString(), windowName);
}

/**
 * Opens a new tab to the online viewer and sends the local page's JSON results
 * to the online viewer using URL.fragment
 * @param {LH.Result} lhr
 * @protected
 */
async function openViewer(lhr) {
  const windowName = 'viewer-' + computeWindowNameSuffix(lhr);
  const url = getAppsOrigin() + '/viewer/';
  await openTabWithUrlData({lhr}, url, windowName);
}

/**
 * Same as openViewer, but uses postMessage.
 * @param {LH.Result} lhr
 * @protected
 */
async function openViewerAndSendData(lhr) {
  const windowName = 'viewer-' + computeWindowNameSuffix(lhr);
  const url = getAppsOrigin() + '/viewer/';
  openTabAndSendData({lhr}, url, windowName);
}

/**
 * Opens a new tab to the treemap app and sends the JSON results using URL.fragment
 * @param {LH.Result} json
 */
function openTreemap(json) {
  const treemapData = json.audits['script-treemap-data'].details;
  if (!treemapData) {
    throw new Error('no script treemap data found');
  }

  /** @type {LH.Treemap.Options} */
  const treemapOptions = {
    lhr: {
      requestedUrl: json.requestedUrl,
      finalUrl: json.finalUrl,
      audits: {
        'script-treemap-data': json.audits['script-treemap-data'],
      },
      configSettings: {
        locale: json.configSettings.locale,
      },
    },
  };
  const url = getAppsOrigin() + '/treemap/';
  const windowName = 'treemap-' + computeWindowNameSuffix(json);

  openTabWithUrlData(treemapOptions, url, windowName);
}

/**
 * @license Copyright 2021 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */

/* eslint-env browser */

/** @typedef {import('./dom.js').DOM} DOM */

class DropDownMenu {
  /**
   * @param {DOM} dom
   */
  constructor(dom) {
    /** @type {DOM} */
    this._dom = dom;
    /** @type {HTMLElement} */
    this._toggleEl; // eslint-disable-line no-unused-expressions
    /** @type {HTMLElement} */
    this._menuEl; // eslint-disable-line no-unused-expressions

    this.onDocumentKeyDown = this.onDocumentKeyDown.bind(this);
    this.onToggleClick = this.onToggleClick.bind(this);
    this.onToggleKeydown = this.onToggleKeydown.bind(this);
    this.onMenuFocusOut = this.onMenuFocusOut.bind(this);
    this.onMenuKeydown = this.onMenuKeydown.bind(this);

    this._getNextMenuItem = this._getNextMenuItem.bind(this);
    this._getNextSelectableNode = this._getNextSelectableNode.bind(this);
    this._getPreviousMenuItem = this._getPreviousMenuItem.bind(this);
  }

  /**
   * @param {function(MouseEvent): any} menuClickHandler
   */
  setup(menuClickHandler) {
    this._toggleEl = this._dom.find('.lh-topbar button.lh-tools__button', this._dom.rootEl);
    this._toggleEl.addEventListener('click', this.onToggleClick);
    this._toggleEl.addEventListener('keydown', this.onToggleKeydown);

    this._menuEl = this._dom.find('.lh-topbar div.lh-tools__dropdown', this._dom.rootEl);
    this._menuEl.addEventListener('keydown', this.onMenuKeydown);
    this._menuEl.addEventListener('click', menuClickHandler);
  }

  close() {
    this._toggleEl.classList.remove('lh-active');
    this._toggleEl.setAttribute('aria-expanded', 'false');
    if (this._menuEl.contains(this._dom.document().activeElement)) {
      // Refocus on the tools button if the drop down last had focus
      this._toggleEl.focus();
    }
    this._menuEl.removeEventListener('focusout', this.onMenuFocusOut);
    this._dom.document().removeEventListener('keydown', this.onDocumentKeyDown);
  }

  /**
   * @param {HTMLElement} firstFocusElement
   */
  open(firstFocusElement) {
    if (this._toggleEl.classList.contains('lh-active')) {
      // If the drop down is already open focus on the element
      firstFocusElement.focus();
    } else {
      // Wait for drop down transition to complete so options are focusable.
      this._menuEl.addEventListener('transitionend', () => {
        firstFocusElement.focus();
      }, {once: true});
    }

    this._toggleEl.classList.add('lh-active');
    this._toggleEl.setAttribute('aria-expanded', 'true');
    this._menuEl.addEventListener('focusout', this.onMenuFocusOut);
    this._dom.document().addEventListener('keydown', this.onDocumentKeyDown);
  }

  /**
   * Click handler for tools button.
   * @param {Event} e
   */
  onToggleClick(e) {
    e.preventDefault();
    e.stopImmediatePropagation();

    if (this._toggleEl.classList.contains('lh-active')) {
      this.close();
    } else {
      this.open(this._getNextMenuItem());
    }
  }

  /**
   * Handler for tool button.
   * @param {KeyboardEvent} e
   */
  onToggleKeydown(e) {
    switch (e.code) {
      case 'ArrowUp':
        e.preventDefault();
        this.open(this._getPreviousMenuItem());
        break;
      case 'ArrowDown':
      case 'Enter':
      case ' ':
        e.preventDefault();
        this.open(this._getNextMenuItem());
        break;
       // no op
    }
  }

  /**
   * Handler for tool DropDown.
   * @param {KeyboardEvent} e
   */
  onMenuKeydown(e) {
    const el = /** @type {?HTMLElement} */ (e.target);

    switch (e.code) {
      case 'ArrowUp':
        e.preventDefault();
        this._getPreviousMenuItem(el).focus();
        break;
      case 'ArrowDown':
        e.preventDefault();
        this._getNextMenuItem(el).focus();
        break;
      case 'Home':
        e.preventDefault();
        this._getNextMenuItem().focus();
        break;
      case 'End':
        e.preventDefault();
        this._getPreviousMenuItem().focus();
        break;
       // no op
    }
  }

  /**
   * Keydown handler for the document.
   * @param {KeyboardEvent} e
   */
  onDocumentKeyDown(e) {
    if (e.keyCode === 27) { // ESC
      this.close();
    }
  }

  /**
   * Focus out handler for the drop down menu.
   * @param {FocusEvent} e
   */
  onMenuFocusOut(e) {
    const focusedEl = /** @type {?HTMLElement} */ (e.relatedTarget);

    if (!this._menuEl.contains(focusedEl)) {
      this.close();
    }
  }

  /**
   * @param {Array<Node>} allNodes
   * @param {?HTMLElement=} startNode
   * @return {HTMLElement}
   */
  _getNextSelectableNode(allNodes, startNode) {
    const nodes = allNodes.filter(/** @return {node is HTMLElement} */ (node) => {
      if (!(node instanceof HTMLElement)) {
        return false;
      }

      // 'Save as Gist' option may be disabled.
      if (node.hasAttribute('disabled')) {
        return false;
      }

      // 'Save as Gist' option may have display none.
      if (window.getComputedStyle(node).display === 'none') {
        return false;
      }

      return true;
    });

    let nextIndex = startNode ? (nodes.indexOf(startNode) + 1) : 0;
    if (nextIndex >= nodes.length) {
      nextIndex = 0;
    }

    return nodes[nextIndex];
  }

  /**
   * @param {?HTMLElement=} startEl
   * @return {HTMLElement}
   */
  _getNextMenuItem(startEl) {
    const nodes = Array.from(this._menuEl.childNodes);
    return this._getNextSelectableNode(nodes, startEl);
  }

  /**
   * @param {?HTMLElement=} startEl
   * @return {HTMLElement}
   */
  _getPreviousMenuItem(startEl) {
    const nodes = Array.from(this._menuEl.childNodes).reverse();
    return this._getNextSelectableNode(nodes, startEl);
  }
}

/**
 * @license Copyright 2021 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */

class TopbarFeatures {
  /**
   * @param {ReportUIFeatures} reportUIFeatures
   * @param {DOM} dom
   */
  constructor(reportUIFeatures, dom) {
    /** @type {LH.Result} */
    this.lhr; // eslint-disable-line no-unused-expressions
    this._reportUIFeatures = reportUIFeatures;
    this._dom = dom;
    this._dropDownMenu = new DropDownMenu(this._dom);
    this._copyAttempt = false;
    /** @type {HTMLElement} */
    this.topbarEl; // eslint-disable-line no-unused-expressions
    /** @type {HTMLElement} */
    this.categoriesEl; // eslint-disable-line no-unused-expressions
    /** @type {HTMLElement?} */
    this.stickyHeaderEl; // eslint-disable-line no-unused-expressions
    /** @type {HTMLElement} */
    this.highlightEl; // eslint-disable-line no-unused-expressions
    this.onDropDownMenuClick = this.onDropDownMenuClick.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onCopy = this.onCopy.bind(this);
    this.collapseAllDetails = this.collapseAllDetails.bind(this);
  }

  /**
   * @param {LH.Result} lhr
   */
  enable(lhr) {
    this.lhr = lhr;
    this._dom.rootEl.addEventListener('keyup', this.onKeyUp);
    this._dom.document().addEventListener('copy', this.onCopy);
    this._dropDownMenu.setup(this.onDropDownMenuClick);
    this._setUpCollapseDetailsAfterPrinting();

    const topbarLogo = this._dom.find('.lh-topbar__logo', this._dom.rootEl);
    topbarLogo.addEventListener('click', () => toggleDarkTheme(this._dom));

    this._setupStickyHeader();
  }

  /**
   * Handler for tool button.
   * @param {Event} e
   */
  onDropDownMenuClick(e) {
    e.preventDefault();

    const el = /** @type {?Element} */ (e.target);

    if (!el || !el.hasAttribute('data-action')) {
      return;
    }

    switch (el.getAttribute('data-action')) {
      case 'copy':
        this.onCopyButtonClick();
        break;
      case 'print-summary':
        this.collapseAllDetails();
        this._print();
        break;
      case 'print-expanded':
        this.expandAllDetails();
        this._print();
        break;
      case 'save-json': {
        const jsonStr = JSON.stringify(this.lhr, null, 2);
        this._reportUIFeatures._saveFile(new Blob([jsonStr], {type: 'application/json'}));
        break;
      }
      case 'save-html': {
        const htmlStr = this._reportUIFeatures.getReportHtml();
        try {
          this._reportUIFeatures._saveFile(new Blob([htmlStr], {type: 'text/html'}));
        } catch (e) {
          this._dom.fireEventOn('lh-log', this._dom.document(), {
            cmd: 'error', msg: 'Could not export as HTML. ' + e.message,
          });
        }
        break;
      }
      case 'open-viewer': {
        // DevTools cannot send data with postMessage, and we only want to use the URL fragment
        // approach for viewer when needed, so check the environment and choose accordingly.
        if (this._dom.isDevTools()) {
          openViewer(this.lhr);
        } else {
          openViewerAndSendData(this.lhr);
        }
        break;
      }
      case 'save-gist': {
        this._reportUIFeatures.saveAsGist();
        break;
      }
      case 'toggle-dark': {
        toggleDarkTheme(this._dom);
        break;
      }
    }

    this._dropDownMenu.close();
  }

  /**
   * Handle copy events.
   * @param {ClipboardEvent} e
   */
  onCopy(e) {
    // Only handle copy button presses (e.g. ignore the user copying page text).
    if (this._copyAttempt && e.clipboardData) {
      // We want to write our own data to the clipboard, not the user's text selection.
      e.preventDefault();
      e.clipboardData.setData('text/plain', JSON.stringify(this.lhr, null, 2));

      this._dom.fireEventOn('lh-log', this._dom.document(), {
        cmd: 'log', msg: 'Report JSON copied to clipboard',
      });
    }

    this._copyAttempt = false;
  }

  /**
   * Copies the report JSON to the clipboard (if supported by the browser).
   */
  onCopyButtonClick() {
    this._dom.fireEventOn('lh-analytics', this._dom.document(), {
      cmd: 'send',
      fields: {hitType: 'event', eventCategory: 'report', eventAction: 'copy'},
    });

    try {
      if (this._dom.document().queryCommandSupported('copy')) {
        this._copyAttempt = true;

        // Note: In Safari 10.0.1, execCommand('copy') returns true if there's
        // a valid text selection on the page. See http://caniuse.com/#feat=clipboard.
        if (!this._dom.document().execCommand('copy')) {
          this._copyAttempt = false; // Prevent event handler from seeing this as a copy attempt.

          this._dom.fireEventOn('lh-log', this._dom.document(), {
            cmd: 'warn', msg: 'Your browser does not support copy to clipboard.',
          });
        }
      }
    } catch (e) {
      this._copyAttempt = false;
      this._dom.fireEventOn('lh-log', this._dom.document(), {cmd: 'log', msg: e.message});
    }
  }

  /**
   * Keyup handler for the document.
   * @param {KeyboardEvent} e
   */
  onKeyUp(e) {
    // Ctrl+P - Expands audit details when user prints via keyboard shortcut.
    if ((e.ctrlKey || e.metaKey) && e.keyCode === 80) {
      this._dropDownMenu.close();
    }
  }

  /**
   * Expands all audit `<details>`.
   * Ideally, a print stylesheet could take care of this, but CSS has no way to
   * open a `<details>` element.
   */
  expandAllDetails() {
    const details = this._dom.findAll('.lh-categories details', this._dom.rootEl);
    details.map(detail => detail.open = true);
  }

  /**
   * Collapses all audit `<details>`.
   * open a `<details>` element.
   */
  collapseAllDetails() {
    const details = this._dom.findAll('.lh-categories details', this._dom.rootEl);
    details.map(detail => detail.open = false);
  }

  _print() {
    if (this._reportUIFeatures._opts.onPrintOverride) {
      this._reportUIFeatures._opts.onPrintOverride(this._dom.rootEl);
    } else {
      self.print();
    }
  }

  /**
   * Resets the state of page before capturing the page for export.
   * When the user opens the exported HTML page, certain UI elements should
   * be in their closed state (not opened) and the templates should be unstamped.
   */
  resetUIState() {
    this._dropDownMenu.close();
  }

  /**
   * Finds the first scrollable ancestor of `element`. Falls back to the document.
   * @param {Element} element
   * @return {Element | Document}
   */
  _getScrollParent(element) {
    const {overflowY} = window.getComputedStyle(element);
    const isScrollable = overflowY !== 'visible' && overflowY !== 'hidden';

    if (isScrollable) {
      return element;
    }

    if (element.parentElement) {
      return this._getScrollParent(element.parentElement);
    }

    return document;
  }

  /**
   * Sets up listeners to collapse audit `<details>` when the user closes the
   * print dialog, all `<details>` are collapsed.
   */
  _setUpCollapseDetailsAfterPrinting() {
    // FF and IE implement these old events.
    if ('onbeforeprint' in self) {
      self.addEventListener('afterprint', this.collapseAllDetails);
    } else {
      // Note: FF implements both window.onbeforeprint and media listeners. However,
      // it doesn't matchMedia doesn't fire when matching 'print'.
      self.matchMedia('print').addListener(mql => {
        if (mql.matches) {
          this.expandAllDetails();
        } else {
          this.collapseAllDetails();
        }
      });
    }
  }

  _setupStickyHeader() {
    // Cache these elements to avoid qSA on each onscroll.
    this.topbarEl = this._dom.find('div.lh-topbar', this._dom.rootEl);
    this.categoriesEl = this._dom.find('div.lh-categories', this._dom.rootEl);

    // Defer behind rAF to avoid forcing layout.
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      // Only present in the DOM if it'll be used (>=2 categories)
      try {
        this.stickyHeaderEl = this._dom.find('div.lh-sticky-header', this._dom.rootEl);
      } catch {
        return;
      }

      // Highlighter will be absolutely positioned at first gauge, then transformed on scroll.
      this.highlightEl = this._dom.createChildOf(this.stickyHeaderEl, 'div', 'lh-highlighter');

      // Update sticky header visibility and highlight when page scrolls/resizes.
      const scrollParent = this._getScrollParent(
        this._dom.find('.lh-container', this._dom.rootEl));
      // The 'scroll' handler must be should be on {Element | Document}...
      scrollParent.addEventListener('scroll', () => this._updateStickyHeader());
      // However resizeObserver needs an element, *not* the document.
      const resizeTarget = scrollParent instanceof window.Document
        ? document.documentElement
        : scrollParent;
      new window.ResizeObserver(() => this._updateStickyHeader()).observe(resizeTarget);
    }));
  }

  /**
   * Toggle visibility and update highlighter position
   */
  _updateStickyHeader() {
    if (!this.stickyHeaderEl) return;

    // Show sticky header when the main 5 gauges clear the topbar.
    const topbarBottom = this.topbarEl.getBoundingClientRect().bottom;
    const categoriesTop = this.categoriesEl.getBoundingClientRect().top;
    const showStickyHeader = topbarBottom >= categoriesTop;

    // Highlight mini gauge when section is in view.
    // In view = the last category that starts above the middle of the window.
    const categoryEls = Array.from(this._dom.rootEl.querySelectorAll('.lh-category'));
    const categoriesAboveTheMiddle =
      categoryEls.filter(el => el.getBoundingClientRect().top - window.innerHeight / 2 < 0);
    const highlightIndex =
      categoriesAboveTheMiddle.length > 0 ? categoriesAboveTheMiddle.length - 1 : 0;

    // Category order matches gauge order in sticky header.
    const gaugeWrapperEls =
      this.stickyHeaderEl.querySelectorAll('.lh-gauge__wrapper, .lh-fraction__wrapper');
    const gaugeToHighlight = gaugeWrapperEls[highlightIndex];
    const origin = gaugeWrapperEls[0].getBoundingClientRect().left;
    const offset = gaugeToHighlight.getBoundingClientRect().left - origin;

    // Mutate at end to avoid layout thrashing.
    this.highlightEl.style.transform = `translate(${offset}px)`;
    this.stickyHeaderEl.classList.toggle('lh-sticky-header--visible', showStickyHeader);
  }
}

/**
 * @license Copyright 2017 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */

/**
 * @fileoverview
 * @suppress {reportUnknownTypes}
 */

/**
 * Generate a filenamePrefix of name_YYYY-MM-DD_HH-MM-SS
 * Date/time uses the local timezone, however Node has unreliable ICU
 * support, so we must construct a YYYY-MM-DD date format manually. :/
 * @param {string} name
 * @param {string|undefined} fetchTime
 */
function getFilenamePrefix(name, fetchTime) {
  const date = fetchTime ? new Date(fetchTime) : new Date();

  const timeStr = date.toLocaleTimeString('en-US', {hour12: false});
  const dateParts = date.toLocaleDateString('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).split('/');
  // @ts-expect-error - parts exists
  dateParts.unshift(dateParts.pop());
  const dateStr = dateParts.join('-');

  const filenamePrefix = `${name}_${dateStr}_${timeStr}`;
  // replace characters that are unfriendly to filenames
  return filenamePrefix.replace(/[/?<>\\:*|"]/g, '-');
}

/**
 * Generate a filenamePrefix of hostname_YYYY-MM-DD_HH-MM-SS.
 * @param {{finalUrl: string, fetchTime: string}} lhr
 * @return {string}
 */
function getLhrFilenamePrefix(lhr) {
  const hostname = new URL(lhr.finalUrl).hostname;
  return getFilenamePrefix(hostname, lhr.fetchTime);
}

/**
 * Generate a filenamePrefix of name_YYYY-MM-DD_HH-MM-SS.
 * @param {{name: string, steps: Array<{lhr: {fetchTime: string}}>}} flowResult
 * @return {string}
 */
function getFlowResultFilenamePrefix(flowResult) {
  const lhr = flowResult.steps[0].lhr;
  const name = flowResult.name.replace(/\s/g, '-');
  return getFilenamePrefix(name, lhr.fetchTime);
}

var fileNamer = {getLhrFilenamePrefix, getFilenamePrefix, getFlowResultFilenamePrefix};

/**
 * @license
 * Copyright 2017 The Lighthouse Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @param {HTMLTableElement} tableEl
 * @return {Array<HTMLElement>}
 */
function getTableRows(tableEl) {
  return Array.from(tableEl.tBodies[0].rows);
}
class ReportUIFeatures {
  /**
   * @param {DOM} dom
   * @param {LH.Renderer.Options} opts
   */
  constructor(dom, opts = {}) {
    /** @type {LH.Result} */
    this.json; // eslint-disable-line no-unused-expressions
    /** @type {DOM} */
    this._dom = dom;

    this._opts = opts;

    this._topbar = opts.omitTopbar ? null : new TopbarFeatures(this, dom);
    this.onMediaQueryChange = this.onMediaQueryChange.bind(this);
  }

  /**
   * Adds tools button, print, and other functionality to the report. The method
   * should be called whenever the report needs to be re-rendered.
   * @param {LH.Result} lhr
   */
  initFeatures(lhr) {
    this.json = lhr;

    if (this._topbar) {
      this._topbar.enable(lhr);
      this._topbar.resetUIState();
    }
    this._setupMediaQueryListeners();
    this._setupThirdPartyFilter();
    this._setupElementScreenshotOverlay(this._dom.rootEl);

    // Do not query the system preferences for DevTools - DevTools should only apply dark theme
    // if dark is selected in the settings panel.
    // TODO: set `disableDarkMode` in devtools and delete this special case.
    const disableDarkMode = this._dom.isDevTools() ||
      this._opts.disableDarkMode || this._opts.disableAutoDarkModeAndFireworks;
    if (!disableDarkMode && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      toggleDarkTheme(this._dom, true);
    }

    // Fireworks!
    // To get fireworks you need 100 scores in all core categories, except PWA (because going the PWA route is discretionary).
    const fireworksRequiredCategoryIds = ['performance', 'accessibility', 'best-practices', 'seo'];
    const scoresAll100 = fireworksRequiredCategoryIds.every(id => {
      const cat = lhr.categories[id];
      return cat && cat.score === 1;
    });
    const disableFireworks =
      this._opts.disableFireworks || this._opts.disableAutoDarkModeAndFireworks;
    if (scoresAll100 && !disableFireworks) {
      this._enableFireworks();
      // If dark mode is allowed, force it on because it looks so much better.
      if (!disableDarkMode) toggleDarkTheme(this._dom, true);
    }

    // Show the metric descriptions by default when there is an error.
    const hasMetricError = lhr.categories.performance && lhr.categories.performance.auditRefs
      .some(audit => Boolean(audit.group === 'metrics' && lhr.audits[audit.id].errorMessage));
    if (hasMetricError) {
      const toggleInputEl = this._dom.find('input.lh-metrics-toggle__input', this._dom.rootEl);
      toggleInputEl.checked = true;
    }

    const showTreemapApp =
      this.json.audits['script-treemap-data'] && this.json.audits['script-treemap-data'].details;
    if (showTreemapApp) {
      this.addButton({
        text: Util.i18n.strings.viewTreemapLabel,
        icon: 'treemap',
        onClick: () => openTreemap(this.json),
      });
    }

    if (this._opts.onViewTrace) {
      this.addButton({
        text: lhr.configSettings.throttlingMethod === 'simulate' ?
          Util.i18n.strings.viewOriginalTraceLabel :
          Util.i18n.strings.viewTraceLabel,
        onClick: () => this._opts.onViewTrace?.(),
      });
    }

    if (this._opts.getStandaloneReportHTML) {
      this._dom.find('a[data-action="save-html"]', this._dom.rootEl).classList.remove('lh-hidden');
    }

    // Fill in all i18n data.
    for (const node of this._dom.findAll('[data-i18n]', this._dom.rootEl)) {
      // These strings are guaranteed to (at least) have a default English string in Util.UIStrings,
      // so this cannot be undefined as long as `report-ui-features.data-i18n` test passes.
      const i18nKey = node.getAttribute('data-i18n');
      const i18nAttr = /** @type {keyof typeof Util.i18n.strings} */ (i18nKey);
      node.textContent = Util.i18n.strings[i18nAttr];
    }
  }

  /**
   * @param {{text: string, icon?: string, onClick: () => void}} opts
   */
  addButton(opts) {
    // Use qSA directly to as we don't want to throw (if this element is missing).
    const metricsEl = this._dom.rootEl.querySelector('.lh-audit-group--metrics');
    if (!metricsEl) return;

    let buttonsEl = metricsEl.querySelector('.lh-buttons');
    if (!buttonsEl) buttonsEl = this._dom.createChildOf(metricsEl, 'div', 'lh-buttons');

    const classes = [
      'lh-button',
    ];
    if (opts.icon) {
      classes.push('lh-report-icon');
      classes.push(`lh-report-icon--${opts.icon}`);
    }
    const buttonEl = this._dom.createChildOf(buttonsEl, 'button', classes.join(' '));
    buttonEl.textContent = opts.text;
    buttonEl.addEventListener('click', opts.onClick);
    return buttonEl;
  }

  resetUIState() {
    if (this._topbar) {
      this._topbar.resetUIState();
    }
  }

  /**
   * Returns the html that recreates this report.
   * @return {string}
   */
  getReportHtml() {
    if (!this._opts.getStandaloneReportHTML) {
      throw new Error('`getStandaloneReportHTML` is not set');
    }

    this.resetUIState();
    return this._opts.getStandaloneReportHTML();
  }

  /**
   * Save json as a gist. Unimplemented in base UI features.
   */
  saveAsGist() {
    // TODO ?
    throw new Error('Cannot save as gist from base report');
  }

  _enableFireworks() {
    const scoresContainer = this._dom.find('.lh-scores-container', this._dom.rootEl);
    scoresContainer.classList.add('lh-score100');
  }

  _setupMediaQueryListeners() {
    const mediaQuery = self.matchMedia('(max-width: 500px)');
    mediaQuery.addListener(this.onMediaQueryChange);
    // Ensure the handler is called on init
    this.onMediaQueryChange(mediaQuery);
  }

  /**
   * Resets the state of page before capturing the page for export.
   * When the user opens the exported HTML page, certain UI elements should
   * be in their closed state (not opened) and the templates should be unstamped.
   */
  _resetUIState() {
    if (this._topbar) {
      this._topbar.resetUIState();
    }
  }

  /**
   * Handle media query change events.
   * @param {MediaQueryList|MediaQueryListEvent} mql
   */
  onMediaQueryChange(mql) {
    this._dom.rootEl.classList.toggle('lh-narrow', mql.matches);
  }

  _setupThirdPartyFilter() {
    // Some audits should not display the third party filter option.
    const thirdPartyFilterAuditExclusions = [
      // These audits deal explicitly with third party resources.
      'uses-rel-preconnect',
      'third-party-facades',
    ];
    // Some audits should hide third party by default.
    const thirdPartyFilterAuditHideByDefault = [
      // Only first party resources are actionable.
      'legacy-javascript',
    ];

    // Get all tables with a text url column.
    const tables = Array.from(this._dom.rootEl.querySelectorAll('table.lh-table'));
    const tablesWithUrls = tables
      .filter(el =>
        el.querySelector('td.lh-table-column--url, td.lh-table-column--source-location'))
      .filter(el => {
        const containingAudit = el.closest('.lh-audit');
        if (!containingAudit) throw new Error('.lh-table not within audit');
        return !thirdPartyFilterAuditExclusions.includes(containingAudit.id);
      });

    tablesWithUrls.forEach((tableEl) => {
      const rowEls = getTableRows(tableEl);
      const thirdPartyRows = this._getThirdPartyRows(rowEls, this.json.finalUrl);

      // create input box
      const filterTemplate = this._dom.createComponent('3pFilter');
      const filterInput = this._dom.find('input', filterTemplate);

      filterInput.addEventListener('change', e => {
        const shouldHideThirdParty = e.target instanceof HTMLInputElement && !e.target.checked;
        let even = true;
        let rowEl = rowEls[0];
        while (rowEl) {
          const shouldHide = shouldHideThirdParty && thirdPartyRows.includes(rowEl);

          // Iterate subsequent associated sub item rows.
          do {
            rowEl.classList.toggle('lh-row--hidden', shouldHide);
            // Adjust for zebra styling.
            rowEl.classList.toggle('lh-row--even', !shouldHide && even);
            rowEl.classList.toggle('lh-row--odd', !shouldHide && !even);

            rowEl = /** @type {HTMLElement} */ (rowEl.nextElementSibling);
          } while (rowEl && rowEl.classList.contains('lh-sub-item-row'));

          if (!shouldHide) even = !even;
        }
      });

      this._dom.find('.lh-3p-filter-count', filterTemplate).textContent =
          `${thirdPartyRows.length}`;
      this._dom.find('.lh-3p-ui-string', filterTemplate).textContent =
          Util.i18n.strings.thirdPartyResourcesLabel;

      const allThirdParty = thirdPartyRows.length === rowEls.length;
      const allFirstParty = !thirdPartyRows.length;

      // If all or none of the rows are 3rd party, hide the control.
      if (allThirdParty || allFirstParty) {
        this._dom.find('div.lh-3p-filter', filterTemplate).hidden = true;
      }

      // Add checkbox to the DOM.
      if (!tableEl.parentNode) return; // Keep tsc happy.
      tableEl.parentNode.insertBefore(filterTemplate, tableEl);

      // Hide third-party rows for some audits by default.
      const containingAudit = tableEl.closest('.lh-audit');
      if (!containingAudit) throw new Error('.lh-table not within audit');
      if (thirdPartyFilterAuditHideByDefault.includes(containingAudit.id) && !allThirdParty) {
        filterInput.click();
      }
    });
  }

  /**
   * @param {Element} rootEl
   */
  _setupElementScreenshotOverlay(rootEl) {
    const fullPageScreenshot =
      this.json.audits['full-page-screenshot'] &&
      this.json.audits['full-page-screenshot'].details &&
      this.json.audits['full-page-screenshot'].details.type === 'full-page-screenshot' &&
      this.json.audits['full-page-screenshot'].details;
    if (!fullPageScreenshot) return;

    ElementScreenshotRenderer.installOverlayFeature({
      dom: this._dom,
      rootEl: rootEl,
      overlayContainerEl: rootEl,
      fullPageScreenshot,
    });
  }

  /**
   * From a table with URL entries, finds the rows containing third-party URLs
   * and returns them.
   * @param {HTMLElement[]} rowEls
   * @param {string} finalUrl
   * @return {Array<HTMLElement>}
   */
  _getThirdPartyRows(rowEls, finalUrl) {
    /** @type {Array<HTMLElement>} */
    const thirdPartyRows = [];
    const finalUrlRootDomain = Util.getRootDomain(finalUrl);

    for (const rowEl of rowEls) {
      if (rowEl.classList.contains('lh-sub-item-row')) continue;

      const urlItem = rowEl.querySelector('div.lh-text__url');
      if (!urlItem) continue;

      const datasetUrl = urlItem.dataset.url;
      if (!datasetUrl) continue;
      const isThirdParty = Util.getRootDomain(datasetUrl) !== finalUrlRootDomain;
      if (!isThirdParty) continue;

      thirdPartyRows.push(rowEl);
    }

    return thirdPartyRows;
  }

  /**
   * @param {Blob|File} blob
   */
  _saveFile(blob) {
    const ext = blob.type.match('json') ? '.json' : '.html';
    const filename = fileNamer.getLhrFilenamePrefix(this.json) + ext;
    if (this._opts.onSaveFileOverride) {
      this._opts.onSaveFileOverride(blob, filename);
    } else {
      this._dom.saveFile(blob, filename);
    }
  }
}

/**
 * @license Copyright 2021 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */

/**
 * @param {LH.Result} lhr
 * @param {LH.Renderer.Options} opts
 * @return {HTMLElement}
 */
function renderReport(lhr, opts = {}) {
  const rootEl = document.createElement('article');
  rootEl.classList.add('lh-root', 'lh-vars');

  const dom = new DOM(rootEl.ownerDocument, rootEl);
  const renderer = new ReportRenderer(dom);

  renderer.renderReport(lhr, rootEl, opts);

  // Hook in JS features and page-level event listeners after the report
  // is in the document.
  const features = new ReportUIFeatures(dom, opts);
  features.initFeatures(lhr);
  return rootEl;
}

/**
 * Returns a new LHR with all strings changed to the new requestedLocale.
 * @param {LH.Result} lhr
 * @param {LH.Locale} requestedLocale
 * @return {{lhr: LH.Result, missingIcuMessageIds: string[]}}
 */
function swapLocale(lhr, requestedLocale) {
  // Stub function only included for types
  return {
    lhr,
    missingIcuMessageIds: [],
  };
}

/**
 * Populate the i18n string lookup dict with locale data
 * Used when the host environment selects the locale and serves lighthouse the intended locale file
 * @see https://docs.google.com/document/d/1jnt3BqKB-4q3AE94UWFA0Gqspx8Sd_jivlB7gQMlmfk/edit
 * @param {LH.Locale} locale
 * @param {Record<string, {message: string}>} lhlMessages
 */
function registerLocaleData(locale, lhlMessages) {
  // Stub function only included for types
}
const format = {registerLocaleData};

export { DOM, ReportRenderer, ReportUIFeatures, format, renderReport, swapLocale };
