/** Temporary cutover gate. Deploy only during the verified maintenance procedure. */
export default {
  fetch(request: Request) {
    const health = new URL(request.url).pathname === '/health';
    return Response.json(health
      ? {service:'BytesSkills',status:'maintenance',writes_paused:true}
      : {error:'Storage migration in progress. Retry shortly; no request was saved.'},
      {status:health?200:503,headers:{'Cache-Control':'no-store','Retry-After':'60'}});
  },
};
