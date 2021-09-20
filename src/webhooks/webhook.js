import {
  linkPullRequest,
  linkBranch,
  referencesToRecords,
} from "../lib/fields.js";
import singleOrArrayMap from "../lib/singleOrArrayMap"

aha.on("webhook", async ({headers, payload}) => {
  const event = headers.HTTP_X_GITHUB_EVENT;

  console.log(`Received webhook '${event}' ${payload.action || ""}`);

  switch (event) {
    case "create":
      await handleCreateBranch(payload);
      break;
    case "pull_request":
      await handlePullRequest(payload);
      break;
    case "pull_request_review":
      await triggerEvent(event, payload, payload.pull_request?.title);
      break;
  }
});

async function handlePullRequest(payload) {
  const pr = payload.pull_request;

  // Make sure the PR is linked to its record.
  const record = await linkPullRequest(pr);

  // Generate events.
  if (record) {
    if (pr.head?.name) {
      await linkBranch(pr.head.name, pr.repo.html_url);
    }

    await triggerEvent("pr", payload, record);
  } else {
    await triggerEvent("pr", payload, null);
  }
}

async function handleCreateBranch(payload) {
  // We only care about branches.
  if (payload.ref_type != "branch") {
    return;
  }

  const records = await linkBranch(payload.ref, payload.repository.html_url);
  await triggerEvent("create", payload, records);
}

/**
 * @param {string} event
 * @param {*} payload
 * @param {*} referenceText
 */
async function triggerEvent(event, payload, referenceText) {
  if (typeof referenceText === "string") {
    const records = await referencesToRecords(referenceText);

    records.forEach(record => aha.triggerServer(`aha-develop.github.${event}.${payload.action}`, {
      record,
      payload,
    }))
  } else {
    const callback = record => aha.triggerServer(`aha-develop.github.${event}.${payload.action}`, {
      record,
      payload,
    })

    singleOrArrayMap(referenceText, callback)
  }
}
