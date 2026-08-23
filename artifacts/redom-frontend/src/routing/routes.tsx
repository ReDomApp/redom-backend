import { Route, Switch } from "wouter";

function FoundationPage() {
  return (
    <main>
      <h1>ReDom</h1>
    </main>
  );
}

function NotFoundPage() {
  return (
    <main>
      <h1>Page not found</h1>
    </main>
  );
}

export function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={FoundationPage} />
      <Route component={NotFoundPage} />
    </Switch>
  );
}