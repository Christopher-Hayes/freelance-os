"use client";

import { useState } from "react";

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
    GET: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30",
    POST: "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30",
    PUT: "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30",
    PATCH: "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30",
    DELETE: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30",
  };

  const typeColors = {
    string: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30",
    number: "text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/30",
    boolean: "text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/30",
    date: "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30",
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
    <div className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full text-left text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
      >
        <span className="flex items-center gap-2">
          <span className="text-lg">🔌</span>
          <span>API Access</span>
        </span>
        <svg
          className={`w-5 h-5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Access this page's data programmatically using these API endpoints:
          </p>
          
          {endpoints.map((endpoint, index) => {
            const fullUrl = getFullUrl(endpoint.path);
            const urlIdentifier = `${index}-url`;
            const codeKey = `${index}-${selectedLanguage[index] || "curl"}`;
            
            return (
              <div
                key={index}
                className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`inline-block px-2 py-1 rounded text-xs font-mono font-semibold ${
                      methodColors[endpoint.method]
                    }`}
                  >
                    {endpoint.method}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2">
                      <code className="text-xs font-mono text-gray-900 dark:text-gray-100 block break-all flex-1">
                        {baseUrl}{endpoint.path}
                      </code>
                      <button
                        onClick={() => copyToClipboard(fullUrl, urlIdentifier)}
                        className="shrink-0 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                        title="Copy full URL"
                      >
                        {copiedUrl === urlIdentifier ? (
                          <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        )}
                      </button>
                    </div>
                    
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      {endpoint.description}
                    </p>

                    {/* Query Parameters */}
                    {endpoint.queryParams && endpoint.queryParams.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Query Parameters:</p>
                        <div className="space-y-1">
                          {endpoint.queryParams.map((param, paramIndex) => (
                            <div key={paramIndex} className="flex items-start gap-2 text-xs">
                              <code className="font-mono text-gray-900 dark:text-gray-100">
                                {param.name}
                              </code>
                              <span className={`px-1.5 py-0.5 rounded text-xs font-mono ${typeColors[param.type]}`}>
                                {param.type}
                              </span>
                              {param.required && (
                                <span className="px-1.5 py-0.5 rounded text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30">
                                  required
                                </span>
                              )}
                              {param.description && (
                                <span className="text-gray-600 dark:text-gray-400">
                                  {param.description}
                                </span>
                              )}
                              {param.enum && (
                                <span className="text-gray-500 dark:text-gray-500 italic">
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
                      <details className="mt-2">
                        <summary className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
                          Example body
                        </summary>
                        <pre className="mt-1 text-xs bg-white dark:bg-gray-900 p-2 rounded border border-gray-200 dark:border-gray-700 overflow-x-auto">
                          <code className="text-gray-800 dark:text-gray-200">{endpoint.body}</code>
                        </pre>
                      </details>
                    )}

                    {/* Code Generation */}
                    {enableCodeGen && onGenerateCode && (
                      <div className="mt-3 border-t border-gray-200 dark:border-gray-600 pt-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <label className="text-xs text-gray-600 dark:text-gray-400">
                            Generate code:
                          </label>
                          <select
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
                            className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                          >
                            {languages.map(lang => (
                              <option key={lang.id} value={lang.id}>{lang.name}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleGenerateCode(endpoint, index)}
                            disabled={generatingCode === codeKey}
                            className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded transition-colors"
                          >
                            {generatingCode === codeKey ? "Generating..." : "Generate"}
                          </button>
                        </div>

                        {generatedCode[codeKey] && (
                          <div className="mt-2 relative">
                            <pre className="text-xs bg-white dark:bg-gray-900 p-3 rounded border border-gray-200 dark:border-gray-700 overflow-x-auto">
                              <code className="text-gray-800 dark:text-gray-200">{generatedCode[codeKey]}</code>
                            </pre>
                            <button
                              onClick={() => copyToClipboard(generatedCode[codeKey] || "", `${codeKey}-code`)}
                              className="absolute top-2 right-2 p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                              title="Copy code"
                            >
                              {copiedUrl === `${codeKey}-code` ? (
                                <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (
                                <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <p className="text-xs text-blue-800 dark:text-blue-200">
              <strong>💡 Tip:</strong> Use curl, fetch, or your favorite HTTP client. Authentication required for all endpoints.
              {enableApiKeys && onGenerateApiKey && (
                <>
                  {" "}
                  <button
                    onClick={onGenerateApiKey}
                    className="underline hover:no-underline font-semibold"
                  >
                    Generate an API key
                  </button>
                  {" "}to authenticate programmatically.
                </>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
