export type CatalogEntry={
 id:string|null;slug:string;name:string;summary:string;category:string;website:string;repository:string|null;aliases:string[];
 sourceState:'tracking'|'stale'|'degraded'|'pending'|'paused'|'unsupported'|'unavailable'|'preview';canMonitor:boolean;historyLimited:boolean;
 lastSuccessfulPoll:string|null;latest:{title:string;tag:string|null;publishedAt:string|null;firstSeenAt:string}|null;monitored:boolean;
};
