export default function McpSetupPage() {
	return (
		<div className="mx-auto max-w-5xl space-y-8 p-6">
			<div>
				<h1 className="text-3xl font-bold text-gray-900 dark:text-white">MCP Setup</h1>
				<p className="mt-2 max-w-3xl text-gray-600 dark:text-gray-400">
					Connect ChatGPT, GitHub Copilot, or another MCP-compatible client to this local admin dashboard so your AI can use your admin tools.
				</p>
			</div>

			<section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
				<h2 className="text-xl font-semibold text-gray-900 dark:text-white">Quick start</h2>
				<ol className="mt-4 space-y-3 text-sm text-gray-700 dark:text-gray-300">
					<li>
						<span className="font-medium">1. Enable the MCP server</span>
						<span className="block text-gray-600 dark:text-gray-400">
							Go to <span className="font-medium">Settings → MCP Server</span> and make sure the MCP endpoint is enabled.
						</span>
					</li>
					<li>
						<span className="font-medium">2. Create an admin API key</span>
						<span className="block text-gray-600 dark:text-gray-400">
							Include <code className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-900">mcp:use</code> plus whichever read/write scopes you want the AI to have.
						</span>
					</li>
					<li>
						<span className="font-medium">3. Point your MCP client at this endpoint</span>
						<span className="block text-gray-600 dark:text-gray-400">
							Use <code className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-900">http://localhost:3010/api/mcp</code> while running the admin dashboard locally.
						</span>
					</li>
				</ol>
			</section>

			<section className="grid gap-6 lg:grid-cols-2">
				<div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
					<h2 className="text-xl font-semibold text-gray-900 dark:text-white">What the endpoint is</h2>
					<div className="mt-4 space-y-3 text-sm text-gray-700 dark:text-gray-300">
						<p>
							This admin dashboard exposes a local MCP endpoint at:
						</p>
						<div className="rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
							http://localhost:3010/api/mcp
						</div>
						<p className="text-gray-600 dark:text-gray-400">
							It uses bearer-token auth with your admin API key and exposes admin tools like listing clients, creating projects, reading time entries, and updating selected settings.
						</p>
					</div>
				</div>

				<div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
					<h2 className="text-xl font-semibold text-gray-900 dark:text-white">Recommended scopes</h2>
					<ul className="mt-4 space-y-2 text-sm text-gray-700 dark:text-gray-300">
						<li><code className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-900">mcp:use</code> — required for MCP access</li>
						<li><code className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-900">read:clients</code></li>
						<li><code className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-900">read:projects</code></li>
						<li><code className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-900">read:time</code></li>
						<li><code className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-900">read:invoices</code></li>
						<li><code className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-900">read:activity</code></li>
						<li><code className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-900">read:settings</code></li>
					</ul>
					<p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
						Add write scopes only if you want the AI to be able to create or modify records.
					</p>
				</div>
			</section>

			<section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
				<h2 className="text-xl font-semibold text-gray-900 dark:text-white">Example connection details</h2>
				<div className="mt-4 grid gap-4 lg:grid-cols-2">
					<div>
						<h3 className="text-sm font-medium text-gray-900 dark:text-white">Remote MCP clients</h3>
						<div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
							{`{
  "url": "http://localhost:3010/api/mcp"
}`}
						</div>
					</div>

					<div>
						<h3 className="text-sm font-medium text-gray-900 dark:text-white">Bearer auth</h3>
						<p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
							Use the API key you generated in Settings → API Keys. The MCP server expects it as a bearer token.
						</p>
						<div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
							Authorization: Bearer YOUR_API_KEY
						</div>
					</div>
				</div>
			</section>

			<section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
				<h2 className="text-xl font-semibold text-gray-900 dark:text-white">Client-specific setup</h2>
				<p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
					Different AI tools expect slightly different MCP configuration formats. For this local Phase 1 setup, bearer-token and header-based clients are the easiest fit.
				</p>

				<div className="mt-6 space-y-6">
					<div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
						<h3 className="text-lg font-semibold text-gray-900 dark:text-white">VS Code / GitHub Copilot / Cursor / Windsurf</h3>
						<p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
							These tools commonly support JSON-based remote MCP configuration with a server URL plus headers. This is the best match for the current local admin-dashboard MCP server.
						</p>
						<div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
							{`{
  "mcpServers": {
    "freelance-os-admin": {
      "url": "http://localhost:3010/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}`}
						</div>
						<ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-700 dark:text-gray-300">
							<li>Use an API key that includes <code className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-900">mcp:use</code>.</li>
							<li>Restart the client or reconnect the MCP server after changing config.</li>
							<li>In VS Code specifically, MCP server configs are often stored in an <code className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-900">mcp.json</code> file or added through the MCP server UI.</li>
						</ul>
					</div>

					<div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
						<h3 className="text-lg font-semibold text-gray-900 dark:text-white">Claude Desktop</h3>
						<p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
							Claude’s newer remote connector flow is increasingly OAuth-focused, but some remote MCP setups also support token-style URL/token entry. For this local Phase 1 server, the safest expectation is that native Claude remote setup may be limited until OAuth is added.
						</p>
						<div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-100">
							<p className="font-medium">Best current option</p>
							<p className="mt-1">
								If Claude accepts a remote MCP URL plus token directly, use <code className="rounded bg-white/70 px-1 py-0.5 text-xs dark:bg-gray-900/60">http://localhost:3010/api/mcp</code> and your admin API key. If Claude insists on OAuth login for remote connectors, this Phase 1 bearer-token server will not be enough yet.
							</p>
						</div>
						<p className="mt-3 text-sm text-gray-700 dark:text-gray-300">
							If you later want first-class Claude remote support, the next step is Phase 2: add OAuth-protected resource metadata and an authorization server flow.
						</p>
					</div>

					<div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
						<h3 className="text-lg font-semibold text-gray-900 dark:text-white">ChatGPT</h3>
						<p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
							ChatGPT custom remote MCP connectors are trending toward app-style setup and OAuth authentication. That means this local bearer-token Phase 1 server may not plug directly into ChatGPT&apos;s connector UI yet.
						</p>
						<div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-100">
							<p className="font-medium">Current expectation</p>
							<p className="mt-1">
								For ChatGPT&apos;s app/connectors UI, OAuth is the more reliable target. This local MCP server is best used today with clients that accept a raw URL plus bearer header configuration.
							</p>
						</div>
						<p className="mt-3 text-sm text-gray-700 dark:text-gray-300">
							If OpenAI expands support for token-based custom MCP connectors in your workspace, the values you&apos;d want are still the same endpoint and API key described on this page.
						</p>
					</div>

					<div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
						<h3 className="text-lg font-semibold text-gray-900 dark:text-white">`mcp.json`-style clients</h3>
						<p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
							If your MCP client supports a shared <code className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-900">mcp.json</code> format, this is the pattern to start with.
						</p>
						<div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
							{`{
  "mcpServers": {
    "freelance-os-admin": {
      "url": "http://localhost:3010/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}`}
						</div>
					</div>
				</div>
			</section>

			<section className="rounded-xl border border-amber-200 bg-amber-50 p-6 shadow-sm dark:border-amber-900/50 dark:bg-amber-900/20">
				<h2 className="text-xl font-semibold text-amber-900 dark:text-amber-100">Local use notes</h2>
				<ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-amber-900 dark:text-amber-100">
					<li>This setup is intended for local desktop use right now.</li>
					<li>If the MCP server is disabled in Settings, MCP authentication will be rejected.</li>
					<li>VS Code-style remote MCP clients are the best fit for the current bearer-token setup.</li>
					<li>ChatGPT and Claude native remote connector flows are more likely to need OAuth for seamless support.</li>
					<li>If you later host this publicly, you’ll likely want OAuth-based MCP auth instead of only bearer API keys.</li>
				</ul>
			</section>
		</div>
	);
}