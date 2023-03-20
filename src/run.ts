import * as core from '@actions/core';
import * as github from '@actions/github';
import { components } from '@octokit/openapi-types';
import { WebhookPayload } from '@actions/github/lib/interfaces';
import { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods';

export type workflowRunStatus = components["parameters"]["workflow-run-status"];

export interface RunOpts {
    owner: string;
    repo: string;
    githubToken: string;
    currentWorkflowRunId: number;
    payload: WebhookPayload;
    limitToPreviousSuccessfulRunCommit: boolean;
    lastSuccessfulRunId?: number;
    status?: workflowRunStatus;
    dryRun: boolean;
};

interface workflowRun {
    id: number;
    html_url: string;
}

export async function run(opts: RunOpts): Promise<void> {
    const { owner, repo, payload } = opts;
    try {
        let branch = "";
        let headSha = "";
        if (payload.pull_request) {
            branch = payload.pull_request.head.ref;
            headSha = payload.pull_request.head.sha;
        } else if (payload.workflow_run) {
            branch = payload.workflow_run.head_branch;
            headSha = payload.workflow_run.head_sha;
        }

        const octokit = github.getOctokit(opts.githubToken);
        const { data: current_run } = await octokit.rest.actions.getWorkflowRun({
            owner,
            repo,
            run_id: opts.currentWorkflowRunId,
        });

        const workflow_id = String(current_run.workflow_id);
        try {
            const {
                data: { total_count, workflow_runs },
            } = await octokit.rest.actions.listWorkflowRuns({
                per_page: 100,
                owner,
                repo,
                workflow_id,
                branch,
                ...(opts.status && { status: opts.status })
            });

            let lastCommit = "";
            if (opts.limitToPreviousSuccessfulRunCommit) {
                if (!opts.lastSuccessfulRunId) {
                    const completed = await octokit.rest.actions.listWorkflowRuns({ owner, repo, workflow_id, branch, status: "success", per_page: 10 });
                    if (completed.data.workflow_runs.length > 0) {
                        const [first] = completed.data.workflow_runs;
                        lastCommit = first.head_sha;
                        core.info(`Last successfully completed workflow run: ${first.id} for commit: ${lastCommit}`)
                    }
                } else {
                    const lastSuccessfulRun = await octokit.rest.actions.getWorkflowRun({ owner: owner, repo: repo, run_id: opts.lastSuccessfulRunId });
                    lastCommit = lastSuccessfulRun.data.head_sha;
                    core.info(`Last successfully completed workflow run: ${lastSuccessfulRun.data.id} for commit: ${lastCommit}`)
                }
            }

            // sha -> workflow
            const shasToWorkflowRuns = Object.fromEntries(workflow_runs.map(workflow => [workflow.head_sha, workflow]));
            const commits = await octokit.paginate(octokit.rest.repos.listCommits, {
                owner: opts.owner,
                repo: opts.repo,
                sha: current_run.head_sha,
                per_page: 100
            }, (response, done) => {
                const idx = response.data.findIndex(commit => commit.sha == lastCommit)
                if (idx >= 0) {
                    done();
                    return response.data.slice(0, idx);
                }
                return response.data;
            });
            var toCancel: workflowRun[] = [];
            toCancel = commits.reduce((toCancel, commit) => {
                if (!(commit.sha in shasToWorkflowRuns)) {
                    return toCancel;
                }
                const workflow = shasToWorkflowRuns[commit.sha];
                if (workflow.conclusion != "completed" && workflow.id != current_run.id) {
                    toCancel.push(workflow);
                }
                return toCancel;
            }, toCancel);

            for (const wf of toCancel) {
                const deployments = await octokit.rest.actions.getPendingDeploymentsForRun({
                    owner: owner,
                    repo: repo,
                    run_id: wf.id,
                });
                core.info(`Will try to cancel workflow run: ${wf.id} waiting on ${deployments.data.map(d => d.environment.name)}`);
                if (!opts.dryRun && deployments.data.length > 0) {
                    await octokit.rest.actions.reviewPendingDeploymentsForRun({
                        owner: owner,
                        repo: repo,
                        state: "rejected",
                        run_id: wf.id,
                        environment_ids: deployments.data.map(d => d.environment.id).filter((d): d is number => !!d),
                        comment: `Superseded by workflow run ${current_run.html_url}`,
                    })
                }
            }
            core.info(`Completed cancellations for ${current_run.id}...`);
            return;

            // TODO actually cancel the workflows.
        } catch (e: any) {
            const msg = e.message || e;
            console.log(`Error while canceling workflow_id ${workflow_id}: ${msg}`);
        }
    } catch (error) {
        if (error instanceof Error) core.setFailed(error.message)
    }
}
