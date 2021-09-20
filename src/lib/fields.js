import {IDENTIFIER} from "../extension";

const PULL_REQUESTS_FIELD = "pullRequests";
const BRANCHES_FIELD = "branches";

/**
 * @typedef {Aha.ReferenceInterface & Aha.HasExtensionFields} LinkableRecord
 */

/**
 * @typedef PrLink
 * @prop {number} id
 * @prop {string} name
 * @prop {string} url
 * @prop {string} state
 */

/**
 * @typedef AccountPr
 * @prop {string} id
 * @prop {number} number
 * @prop {[string, string]} ahaReference
 */

/**
 * Append a field/value pair to the given record.
 *
 * @param {Aha.ApplicationModel & Aha.HasExtensionFields} record
 * @param {string} fieldName
 * @param {*} newValue
 */
async function appendField(record, fieldName, newValue) {
  // Link to Aha! record.
  console.log(
    `Link to ${record.typename}:${record["referenceNum"] || record.uniqueId}`
  );

  await replaceField(record, fieldName, (value) => {
    /** @type {{id:any}[]} */
    const list = [...(value || [])];
    const existing = list.findIndex((item) => item.id == newValue.id);

    if (existing > -1) {
      list.splice(existing, 1, newValue);
    } else {
      list.push(newValue);
    }

    return list;
  });
}

/**
 * @template T
 * @param {Aha.HasExtensionFields} record
 * @param {string} fieldName
 * @param {((value: T|null) => T | Promise<T>)} replacer
 */
async function replaceField(record, fieldName, replacer) {
  const fieldValue = await record.getExtensionField(IDENTIFIER, fieldName);
  const newValue = await replacer(fieldValue);
  await record.setExtensionField(IDENTIFIER, fieldName, newValue);
}

/**
 * @param {number} number
 * @param {string} ref
 */
function accountPrId(number, ref) {
  return [number, ref].join("");
}

/**
 * @param {*} pr
 * @returns {PrLink}
 */
function githubPrToPrLink(pr) {
  return {
    id: pr.number,
    name: pr.title,
    url: pr.html_url || pr.url,
    state: pr.merged ? "merged" : pr.state,
  };
}

/**
 * @param {import("./github").PrForLink} pr
 * @param {LinkableRecord} record
 */
async function linkPullRequestToRecord(pr, record) {
  await appendField(record, PULL_REQUESTS_FIELD, githubPrToPrLink(pr));

  await appendField(aha.account, PULL_REQUESTS_FIELD, {
    id: accountPrId(pr.number, record.referenceNum),
    prNumber: pr.number,
    ahaReference: [record.typename, record.referenceNum],
  });

  if (pr.headRef) {
    await linkBranchToRecord(pr.headRef.name, pr.repository.url, record);
  }
}

/**
 * @param {import("./github").PrForLink} pr
 */
async function linkPullRequest(pr) {
  const records = await referencesToRecords(pr.title);

  if (records) {
    for(let i = 0; i < records.length; ++i) {
      const record = records[i];

      await linkPullRequestToRecord(pr, record);
    }
  }

  return records;
}

/**
 * @param {LinkableRecord} record
 * @param {*} number
 */
async function unlinkPullRequest(record, number) {
  await replaceField(record, PULL_REQUESTS_FIELD, (prs) => {
    if (prs) {
      return prs.filter((pr) => pr.id != number);
    } else {
      return [];
    }
  });

  await replaceField(aha.account, PULL_REQUESTS_FIELD, (prs) => {
    if (prs) {
      return prs.filter(
        (pr) => pr.id == accountPrId(number, record.referenceNum)
      );
    } else {
      return [];
    }
  });
}

/**
 * @param {Aha.ReferenceInterface & Aha.HasExtensionFields} record
 */
async function unlinkPullRequests(record) {
  /** @type {PrLink[]} */
  const prs =
    (await record.getExtensionField(IDENTIFIER, PULL_REQUESTS_FIELD)) || [];
  const ids = prs.map((pr) => accountPrId(pr.id, record.referenceNum));

  await replaceField(
    aha.account,
    PULL_REQUESTS_FIELD,
    (/** @type {AccountPr[]} */ accountPrs) => {
      if (!accountPrs) return [];
      return accountPrs.filter((accountPr) => !ids.includes(accountPr.id));
    }
  );

  await record.setExtensionField(IDENTIFIER, PULL_REQUESTS_FIELD, []);
}

export async function allPrs() {
  const prs = await aha.account.getExtensionField(
    IDENTIFIER,
    PULL_REQUESTS_FIELD
  );
  return prs || [];
}

/**
 * @param {LinkableRecord} record
 * @param {string} branchName
 * @param {string} repoUrl
 */
async function linkBranchToRecord(branchName, repoUrl, record) {
  await appendField(record, BRANCHES_FIELD, {
    id: branchName,
    name: branchName,
    url: `${repoUrl}/tree/${branchName}`,
  });
}

/**
 * @param {string} branchName
 * @param {string} repoUrl
 */
async function linkBranch(branchName, repoUrl) {
  const records = await referencesToRecords(branchName);
  if (records) {
    await Promise.all(records.map(record => linkBranchToRecord(branchName, repoUrl, record)));
    return records;
  }
}

/**
 * @param {Aha.HasExtensionFields} record
 */
async function unlinkBranches(record) {
  await record.setExtensionField(IDENTIFIER, BRANCHES_FIELD, []);
}

/**
 * @param {string} str
 * @returns {Promise<([Aha.HasExtensionFields & Aha.ReferenceInterface])|null>}
 */
export async function referencesToRecords(str) {
  const ahaReferences = extractReferences(str);
  if (!ahaReferences) {
    return null;
  }

  const ret = [];
  for(let i = 0; i < ahaReferences.length; ++i) {
    const ahaReference = ahaReferences[i];

    console.log(
      `Searching for ${ahaReference.type} ref ${ahaReference.referenceNum}`
    );

    const RecordClass = aha.models[ahaReference.type];
    if (!RecordClass) {
      console.log(`Unknown record type ${ahaReference.type}`);
      return null;
    }

    ret[i] = await RecordClass.select("id", "referenceNum").find(
      ahaReference.referenceNum
    )
  }
  return ret;
}

/**
 * @param {string} name
 */
function extractReferences(name) {
  let matches;

  // Requirement
  if ((matches = name.match(/[a-z]{1,10}-[0-9]+-[0-9]+/gi))) {
    return matches.map(match => ({
      type: "Requirement",
      referenceNum: match,
    }));
  }
  // Epic
  if ((matches = name.match(/[a-z]{1,10}-E-[0-9]+/gi))) {
    return matches.map(match => ({
      type: "Epic",
      referenceNum: match,
    }));
  }
  // Feature
  if ((matches = name.match(/[a-z]{1,10}-[0-9]+/gi))) {
    return matches.map(match => ({
      type: "Feature",
      referenceNum: match,
    }));
  }

  return null;
}

export {
  appendField,
  linkPullRequest,
  linkPullRequestToRecord,
  unlinkPullRequest,
  unlinkPullRequests,
  linkBranch,
  unlinkBranches,
  githubPrToPrLink,
};
