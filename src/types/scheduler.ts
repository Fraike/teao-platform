export interface CronTask {
  stop: () => void;
  destroy?: () => void;
}

export interface CronScheduler {
  schedule: (expression: string, callback: () => void, options?: {timezone: string}) => CronTask;
}
