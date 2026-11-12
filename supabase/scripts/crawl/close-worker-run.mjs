#!/usr/bin/env node
// Last step of a crawl job: close the worker run row if the job was interrupted or cancelled.
import {closeOpenWorkerRun} from './worker-runs.mjs';
try{await closeOpenWorkerRun(process.env.CRAWL_WORKER_RUN_ID,process.env.JOB_STATUS);}
catch{console.error('Could not close the worker run record; see the Actions log.');}
