export const prerender = true;

export function GET() {
  return new Response(
    JSON.stringify(
      {
        service: 'hownote',
        build: __HOWNOTE_BUILD_SHA__,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store, max-age=0',
      },
    },
  );
}
