"use client";

import { useState } from "react";
import { Braces, Check, ChevronDown, Copy, KeyRound, Sparkles, TerminalSquare } from "lucide-react";
import { Badge } from "./badge";
import { Button } from "./button";
import { Select } from "./select";
import { Surface } from "./surface";
import { cn } from "./utils";

type QueryParam = {
  name: string;
  type: "string" | "number" | "boolean" | "date";
  required?: boolean;
  description?: string;
  enum?: string[];
};

type APIEndpoint = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  description: string;
  body?: string;
  queryParams?: QueryParam[];
};

type APIFooterProps = {
  endpoints: APIEndpoint[];
  baseUrl?: string;
  enableApiKeys?: boolean;
  enableCodeGen?: boolean;
  onGenerateApiKey?: () => void;
  onGenerateCode?: (endpoint: APIEndpoint, language: string) => Promise<string>;
};

export function APIFooter({ 
  endpoints, 
  baseUrl = "/api",
  enableApiKeys = false,
  enableCodeGen = false,
  onGenerateApiKey,
  onGenerateCode,
}: APIFooterProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [generatingCode, setGeneratingCode] = useState<string | null>(null);
  const [generatedCode, setGeneratedCode] = useState<{[key: string]: string}>({});
  const [selectedLanguage, setSelectedLanguage] = useState<{[key: number]: string}>({});

  if (endpoints.length === 0) return null;

  const methodColors = {
    GET: "info",
    POST: "success",
    PUT: "warning",
    PATCH: "warning",
    DELETE: "danger",
  } as const;

  const typeColors = {
    string: "default",
    number: "info",
    boolean: "warning",
    date: "subtle",
  } as const;

  const languageLabels = {
    curl: "cURL",
    "javascript-fetch": "JavaScript (fetch)",
    "javascript-axios": "JavaScript (axios)",
    "python-requests": "Python (requests)",
    "python-httpx": "Python (httpx)",
    go: "Go (net/http)",
    php: "PHP (Guzzle)",
    ruby: "Ruby (net/http)",
  };

  const languages = [
    { id: "curl", name: "cURL" },
    { id: "javascript-fetch", name: "JavaScript (fetch)" },
    { id: "javascript-axios", name: "JavaScript (axios)" },
    { id: "python-requests", name: "Python (requests)" },
    { id: "python-httpx", name: "Python (httpx)" },
    { id: "go", name: "Go (net/http)" },
    { id: "php", name: "PHP (Guzzle)" },
    { id: "ruby", name: "Ruby (net/http)" },
  ];

  const getFullUrl = (path: string) => {
    if (typeof window === "undefined") return `${baseUrl}${path}`;
    return `${window.location.origin}${baseUrl}${path}`;
  };

  const copyToClipboard = async (text: string, identifier: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedUrl(identifier);
      setTimeout(() => setCopiedUrl(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleGenerateCode = async (endpoint: APIEndpoint, index: number) => {
    const language = selectedLanguage[index] || "curl";
    const cacheKey = `${index}-${language}`;
    
    // Check cache first
    if (generatedCode[cacheKey]) {
      return;
    }

    if (!onGenerateCode) return;

    setGeneratingCode(cacheKey);
    try {
      const code = await onGenerateCode(endpoint, language);
      setGeneratedCode(prev => ({ ...prev, [cacheKey]: code }));
    } catch (err) {
      console.error("Failed to generate code:", err);
    } finally {
      setGeneratingCode(null);
    }
  };

  return (
    <Surface className="mt-10 border-dashed bg-slate-50/70 dark:bg-slate-900/60" padding="md">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900">
            <TerminalSquare className="h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">API access</h2>
              <Badge variant="subtle" size="sm">Developer tools</Badge>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Explore authenticated endpoints, copy request URLs, and generate starter client code without leaving the page.
            </p>
          </div>
        </div>
        <ChevronDown
          className={cn(
            "h-5 w-5 shrink-0 text-slate-400 transition-transform dark:text-slate-500",
            isExpanded && "rotate-180"
          )}
        />
      </button>

      {isExpanded && (
        <div className="mt-6 space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Access this page's data programmatically using these API endpoints:
          </p>
          
          {endpoints.map((endpoint, index) => {
            const fullUrl = getFullUrl(endpoint.path);
            const urlIdentifier = `${index}-url`;
            const codeKey = `${index}-${selectedLanguage[index] || "curl"}`;
            
            return (
              <Surface
                key={index}
                padding="sm"
                className="border-slate-200/80 bg-white/90 dark:border-white/10 dark:bg-slate-950/70"
              >
                <div className="flex items-start gap-3">
                  <Badge variant={methodColors[endpoint.method]} size="sm" className="font-mono uppercase tracking-wide">
                    {endpoint.method}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2">
                      <code className="block flex-1 break-all font-mono text-xs text-slate-900 dark:text-slate-100">
                        {baseUrl}{endpoint.path}
                      </code>
                      <Button
                        onClick={() => copyToClipboard(fullUrl, urlIdentifier)}
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 shrink-0 p-0"
                        title="Copy full URL"
                      >
                        {copiedUrl === urlIdentifier ? (
                          <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Copy className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                        )}
                      </Button>
                    </div>
                    
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                      {endpoint.description}
                    </p>

                    {/* Query Parameters */}
                    {endpoint.queryParams && endpoint.queryParams.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Query parameters</p>
                        <div className="space-y-2">
                          {endpoint.queryParams.map((param, paramIndex) => (
                            <div key={paramIndex} className="flex flex-wrap items-start gap-2 text-xs">
                              <code className="font-mono font-medium text-slate-900 dark:text-slate-100">
                                {param.name}
                              </code>
                              <Badge variant={typeColors[param.type]} size="sm" className="font-mono">
                                {param.type}
                              </Badge>
                              {param.required && (
                                <Badge variant="danger" size="sm">
                                  required
                                </Badge>
                              )}
                              {param.description && (
                                <span className="text-slate-600 dark:text-slate-400">
                                  {param.description}
                                </span>
                              )}
                              {param.enum && (
                                <span className="italic text-slate-500 dark:text-slate-500">
                                  ({param.enum.join(" | ")})
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Request Body */}
                    {endpoint.body && (
                      <details className="mt-3 group">
                        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 transition-colors group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-200">
                          Example body
                        </summary>
                        <pre className="mt-2 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-950 p-4 text-xs dark:border-white/10">
                          <code className="text-slate-100">{endpoint.body}</code>
                        </pre>
                      </details>
                    )}

                    {/* Code Generation */}
                    {enableCodeGen && onGenerateCode && (
                      <div className="mt-4 border-t border-slate-200 pt-4 dark:border-white/10">
                        <div className="flex flex-wrap items-end gap-3">
                          <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                            Generate code:
                          </label>
                          <div className="min-w-[220px] flex-1">
                            <Select
                            value={selectedLanguage[index] || "curl"}
                            onChange={(e) => {
                              setSelectedLanguage(prev => ({ ...prev, [index]: e.target.value }));
                              // Clear cached code for this endpoint
                              const oldKey = `${index}-${selectedLanguage[index] || "curl"}`;
                              setGeneratedCode(prev => {
                                const newCode = { ...prev };
                                delete newCode[oldKey];
                                return newCode;
                              });
                            }}
                            className="text-sm"
                          >
                            {languages.map(lang => (
                              <option key={lang.id} value={lang.id}>{lang.name}</option>
                            ))}
                            </Select>
                          </div>
                          <Button
                            onClick={() => handleGenerateCode(endpoint, index)}
                            disabled={generatingCode === codeKey}
                            size="sm"
                            leftIcon={<Sparkles className="h-4 w-4" />}
                          >
                            {generatingCode === codeKey ? "Generating..." : "Generate"}
                          </Button>
                        </div>

                        {generatedCode[codeKey] && (
                          <div className="mt-2 relative">
                            <div className="mb-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                              <Braces className="h-3.5 w-3.5" />
                              <span>{languageLabels[(selectedLanguage[index] || "curl") as keyof typeof languageLabels]}</span>
                            </div>
                            <pre className="overflow-x-auto rounded-2xl border border-slate-200 bg-slate-950 p-4 text-xs dark:border-white/10">
                              <code className="text-slate-100">{generatedCode[codeKey]}</code>
                            </pre>
                            <Button
                              onClick={() => copyToClipboard(generatedCode[codeKey] || "", `${codeKey}-code`)}
                              variant="secondary"
                              size="sm"
                              className="absolute right-3 top-9"
                              title="Copy code"
                            >
                              {copiedUrl === `${codeKey}-code` ? (
                                <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Surface>
            );
          })}

          <div className="rounded-2xl border border-blue-200/80 bg-blue-50/80 p-4 dark:border-blue-900 dark:bg-blue-950/20">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white dark:bg-blue-500">
                <KeyRound className="h-4 w-4" />
              </div>
              <p className="text-sm text-blue-900 dark:text-blue-100">
                <strong className="font-semibold">Authentication required.</strong> Use cURL, fetch, or your preferred HTTP client with an admin password or API key.
              {enableApiKeys && onGenerateApiKey && (
                <>
                  {" "}
                  <button
                    onClick={onGenerateApiKey}
                    className="font-semibold underline decoration-blue-400 underline-offset-4 transition hover:decoration-transparent"
                  >
                    Generate an API key
                  </button>
                  {" "}to authenticate programmatically.
                </>
              )}
              </p>
            </div>
          </div>
        </div>
      )}
    </Surface>
  );
}
