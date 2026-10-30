// Legacy bookmarks open the dashboard; link-public Hermes has no sign-in form.
export function GET(request:Request){return Response.redirect(new URL('/dashboard',request.url),303)}
