import * as core from '@actions/core';
import * as github from '@actions/github';
import { run, workflowRunStatus } from './run';


function mustGetEnvOrInput(envVar: string, inputName: string): string {
  return process.env[envVar] ?? core.getInput(inputName, {required: true}); 
}

async function main() {
  const {
    repo: { owner, repo },
    payload,
  } = github.context;
  const lastSuccessfulRun = core.getInput("last-successful-run-id", {required: false});
  run({
    owner: owner,
    repo: repo, 
    githubToken: core.getInput('access-token'),
    currentWorkflowRunId: Number(mustGetEnvOrInput("GITHUB_RUN_ID", "workflow-run-id")),
    payload: payload,
    limitToPreviousSuccessfulRunCommit: core.getBooleanInput("limit-to-previous-successful-run-commit", {required: false}),
    lastSuccessfulRunId: lastSuccessfulRun ? Number(lastSuccessfulRun): undefined,
    status: core.getInput('status-of-workflows-to-cancel', {required: true}) as workflowRunStatus,
    dryRun: core.getBooleanInput('dry-run', {required: true}),
  })
    .then(() => core.info('Workflow cancel run completed.'))
    .catch((e: any) => core.setFailed(e.message));
}

main()
