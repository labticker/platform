/** Fly's frequent liveness probe must not keep autosuspended PostgreSQL awake. */
export function GET(){return Response.json({service:'LabTicker',status:'alive'},{headers:{'Cache-Control':'no-store'}});}
