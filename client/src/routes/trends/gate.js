// Concurrency gate for the fan-out panels.
//
// The forecastability board and the correlation matrix each issue one request
// per crime head. Firing eight or sixteen at once trips the Catalyst API
// gateway's rate limiter — the browser gets a burst of HTTP 429s, react-query
// retries them, and the retries arrive as a second thundering herd. Routing
// every fan-out request through a small fixed number of slots keeps the panels
// just as fast in practice (the server is the bottleneck, not the queue) and
// stops one card from starving the rest of the page.
//
// Deliberately dependency-free and module-scoped: the limit is shared across
// every panel on the route, which is the point.

const MAX_ACTIVE = 3;
let active = 0;
const waiting = [];

function release() {
  active -= 1;
  const run = waiting.shift();
  if (run) run();
}

/** Run `fn` (a promise-returning thunk) once a slot frees up. */
export function gated(fn) {
  return new Promise((resolve, reject) => {
    const run = () => {
      active += 1;
      Promise.resolve()
        .then(fn)
        .then(
          (value) => { release(); resolve(value); },
          (err) => { release(); reject(err); },
        );
    };
    if (active < MAX_ACTIVE) run();
    else waiting.push(run);
  });
}
