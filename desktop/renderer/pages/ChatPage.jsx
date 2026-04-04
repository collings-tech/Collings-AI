import React, { useEffect, useRef, useState, useCallback } from "react";
import useAppStore from "../store/appStore";
import ChatBubble from "../components/ChatBubble";
import TypingIndicator from "../components/TypingIndicator";
import ThinkingBlock from "../components/ThinkingBlock";
import ActionCard from "../components/ActionCard";
import SeoSummaryCard from "../components/SeoSummaryCard";

function getDomainLabel(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url || "";
  }
}

export default function ChatPage({ onBack }) {
  const {
    activeSite,
    chatHistory,
    appendMessage,
    setChatHistory,
    isLoading,
    setLoading,
  } = useAppStore();

  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState([]); // { name, type, dataUrl, size }
  const [detectedSeoPlugin, setDetectedSeoPlugin] = useState("none");
  const [actionResults, setActionResults] = useState({}); // keyed by message index
  const [thinkingMap, setThinkingMap] = useState({}); // keyed by message index → thinking string
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  const siteId = activeSite?.id || activeSite?._id;
  const messages = chatHistory[siteId] || [];

  useEffect(() => {
    loadHistory();
    detectSeo();
  }, [siteId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadHistory = async () => {
    if (!siteId) return;
    try {
      const result = await window.electronAPI.invoke("history:get", { siteId });
      if (result.history && Array.isArray(result.history)) {
        const msgs = result.history.flatMap((h) => {
          const out = [];
          if (h.userMessage)
            out.push({
              role: "user",
              content: h.userMessage,
              timestamp: h.createdAt,
            });
          if (h.assistantReply)
            out.push({
              role: "assistant",
              content: h.assistantReply,
              timestamp: h.createdAt,
            });
          return out;
        });
        setChatHistory(siteId, msgs);
      }
    } catch {
      // Non-fatal: start with empty history
    }
  };

  const detectSeo = async () => {
    if (!activeSite) return;
    try {
      const result = await window.electronAPI.invoke("seo:detect-plugin", {
        siteUrl: activeSite.siteUrl || activeSite.site_url,
        wpUsername: activeSite.wpUsername || activeSite.wp_username,
        wpAppPassword: activeSite.wpAppPassword || activeSite.wp_app_password,
      });
      if (result.plugin) setDetectedSeoPlugin(result.plugin);
    } catch {
      // Stick with 'none'
    }
  };

  const handleClearChat = async () => {
    if (!window.confirm("Clear all chat history for this site?")) return;
    try {
      await window.electronAPI.invoke("history:clear", { siteId });
      setChatHistory(siteId, []);
      setActionResults({});
    } catch (err) {
      alert(err.message || "Failed to clear history.");
    }
  };

  const isWordPressDeletionQuery = (message) => {
    const lower = message.toLowerCase();
    const deletionKeywords = ["delete", "deleted", "deleting", "remove", "removed", "removing", "trash", "erase", "erasing", "wipe", "purge"];
    const wordpressKeywords = ["post", "page", "comment", "media", "plugin", "theme", "user", "category", "tag", "menu", "widget", "attachment", "draft", "revision", "wordpress", "wp"];
    const hasDeletion = deletionKeywords.some((k) => lower.includes(k));
    const hasWpContext = wordpressKeywords.some((k) => lower.includes(k));
    return hasDeletion && hasWpContext;
  };

  const handleSend = useCallback(async () => {
    const userMessage = input.trim();
    if ((!userMessage && attachments.length === 0) || isLoading) return;

    setInput("");
    const currentAttachments = attachments;
    setAttachments([]);
    textareaRef.current?.focus();

    const userMsg = {
      role: "user",
      content: userMessage,
      attachments: currentAttachments.length > 0 ? currentAttachments : undefined,
      timestamp: new Date().toISOString(),
    };
    appendMessage(siteId, userMsg);

    if (userMessage && isWordPressDeletionQuery(userMessage)) {
      appendMessage(siteId, {
        role: "assistant",
        content: "For safety, any deletion should be done directly in your **WordPress Dashboard**. Please log in to your WordPress admin panel to delete posts, pages, media, plugins, or any other content. This helps ensure you have full control and can use the built-in trash/recovery features WordPress provides.",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    setLoading(true);

    try {
      const result = await window.electronAPI.invoke("chat:send-message", {
        siteId,
        siteUrl: activeSite.siteUrl || activeSite.site_url,
        wpUsername: activeSite.wpUsername || activeSite.wp_username,
        wpAppPassword: activeSite.wpAppPassword || activeSite.wp_app_password,
        messages: messages,
        userMessage,
        attachments: currentAttachments,
        detectedSeoPlugin,
      });

      if (result.error) {
        appendMessage(siteId, {
          role: "assistant",
          content: `I encountered an error: ${result.error}`,
          timestamp: new Date().toISOString(),
        });
      } else {
        const assistantMsg = {
          role: "assistant",
          content: result.reply,
          timestamp: new Date().toISOString(),
        };
        appendMessage(siteId, assistantMsg);

        const assistantIndex = messages.length + 1;

        // Store thinking keyed to this assistant message index
        if (result.thinking) {
          setThinkingMap((prev) => ({
            ...prev,
            [assistantIndex]: result.thinking,
          }));
        }

        // Store action result keyed to this assistant message index
        if (result.actionResult) {
          setActionResults((prev) => ({
            ...prev,
            [assistantIndex]: result.actionResult,
          }));
        }
      }
    } catch (err) {
      appendMessage(siteId, {
        role: "assistant",
        content: `Something went wrong: ${err.message}`,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  }, [input, attachments, isLoading, siteId, messages, activeSite, detectedSeoPlugin]);

  const processFiles = (files) => {
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setAttachments((prev) => [
          ...prev,
          { name: file.name || `pasted-${Date.now()}`, type: file.type, dataUrl: e.target.result, size: file.size },
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = (e) => {
    if (e.target.files?.length) {
      processFiles(e.target.files);
      e.target.value = "";
    }
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const fileItems = Array.from(items).filter((item) => item.kind === "file");
    if (fileItems.length > 0) {
      e.preventDefault();
      fileItems.forEach((item) => {
        const file = item.getAsFile();
        if (file) processFiles([file]);
      });
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files?.length) processFiles(e.dataTransfer.files);
  };

  const removeAttachment = (index) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const siteUrl = activeSite?.siteUrl || activeSite?.site_url || "";
  const siteLabel = activeSite?.label || getDomainLabel(siteUrl);

  const seoPluginLabel =
    detectedSeoPlugin === "yoast"
      ? "Yoast SEO"
      : detectedSeoPlugin === "rankmath"
        ? "Rank Math"
        : null;

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      {/* Top bar */}
      <header className="bg-gray-800/80 backdrop-blur-md border-b border-gray-700 px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-gray-400 hover:text-white hover:bg-gray-700 px-3 py-1.5 rounded-xl transition-all border border-transparent hover:border-gray-600 text-sm"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          <span className="hidden sm:block">Dashboard</span>
        </button>

        <div className="flex-1 flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 bg-brand-900/60 border border-brand-700/40 rounded-xl flex items-center justify-center flex-shrink-0">
            <svg
              className="w-4 h-4 text-brand-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <h2 className="text-white font-semibold text-sm truncate">
              {siteLabel}
            </h2>
            <p className="text-gray-500 text-xs font-mono truncate">
              {getDomainLabel(siteUrl)}
            </p>
          </div>

          {seoPluginLabel && (
            <span className="hidden sm:block text-xs bg-brand-900/40 border border-brand-700/40 text-brand-300 px-2 py-0.5 rounded-full flex-shrink-0">
              {seoPluginLabel}
            </span>
          )}
        </div>

        <button
          onClick={handleClearChat}
          className="flex items-center gap-1.5 text-gray-400 hover:text-red-400 hover:bg-red-900/20 px-3 py-1.5 rounded-xl transition-all border border-transparent hover:border-red-800/40 text-sm flex-shrink-0"
          title="Clear chat history"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
          <span className="hidden sm:block">Clear</span>
        </button>
      </header>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center pb-8">
            <img src="./collings-logo-solo.png" alt="Collings AI" className="w-16 h-16 mb-4 rounded-2xl" />
            <h3 className="text-xl font-semibold text-gray-200 mb-2">
              Ready to help
            </h3>
            <p className="text-gray-500 text-sm max-w-sm mb-6">
              Ask me to create posts, manage content, optimize SEO, or anything
              else for <strong className="text-gray-400">{siteLabel}</strong>.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
              {[
                "Create a draft blog post about WordPress security tips",
                "List my 5 most recent posts",
                "Write a page about our company services",
                "Create a post and optimize it for SEO",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  className="text-left text-xs text-gray-400 hover:text-brand-300 bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-brand-600/50 rounded-xl px-3 py-2.5 transition-all"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="max-w-3xl mx-auto">
          {messages.map((message, index) => (
            <React.Fragment key={index}>
              {message.role === "assistant" && thinkingMap[index] && (
                <ThinkingBlock thinking={thinkingMap[index]} />
              )}
              <ChatBubble message={message} />
              {message.role === "assistant" && actionResults[index] && (
                <ActionCard actionResult={actionResults[index]} />
              )}
              {message.role === "assistant" && (
                <SeoSummaryCard
                  content={message.content}
                  detectedSeoPlugin={detectedSeoPlugin}
                />
              )}
            </React.Fragment>
          ))}
          {isLoading && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-gray-700 bg-gray-800/50 backdrop-blur-md px-4 py-3">
        <div className="max-w-3xl mx-auto">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.txt,.doc,.docx,.csv"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Attachment previews */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2 px-1">
              {attachments.map((att, i) => (
                <div
                  key={i}
                  className="relative group flex items-center gap-1.5 bg-gray-700 border border-gray-600 rounded-xl overflow-hidden"
                >
                  {att.type.startsWith("image/") ? (
                    <img
                      src={att.dataUrl}
                      alt={att.name}
                      className="h-14 w-14 object-cover"
                    />
                  ) : (
                    <div className="flex items-center gap-1.5 px-3 py-2">
                      <svg className="w-4 h-4 text-brand-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="text-xs text-gray-300 max-w-[120px] truncate">{att.name}</span>
                    </div>
                  )}
                  <button
                    onClick={() => removeAttachment(i)}
                    className="absolute top-0.5 right-0.5 w-5 h-5 bg-gray-900/80 hover:bg-red-900/80 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          <div
            style={{ display: "flex", alignItems: "center" }}
            className="flex items-end gap-3 bg-gray-800 border border-gray-600 focus-within:border-brand-500 rounded-2xl px-4 py-3 transition-all shadow-lg"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            {/* Attach button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="flex-shrink-0 w-7 h-7 text-gray-500 hover:text-brand-400 disabled:opacity-40 transition-colors flex items-center justify-center"
              title="Attach file or image"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Ask me to manage your WordPress site..."
              rows={1}
              disabled={isLoading}
              className="flex-1 bg-transparent text-white placeholder-gray-500 resize-none focus:outline-none text-sm leading-relaxed max-h-36 overflow-y-auto disabled:opacity-50"
              style={{ minHeight: "24px" }}
              onInput={(e) => {
                e.target.style.height = "auto";
                e.target.style.height =
                  Math.min(e.target.scrollHeight, 144) + "px";
              }}
            />
            <button
              onClick={handleSend}
              disabled={(!input.trim() && attachments.length === 0) || isLoading}
              className="flex-shrink-0 w-9 h-9 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-all flex items-center justify-center shadow-md shadow-brand-900/40"
              title="Send (Enter)"
            >
              {isLoading ? (
                <svg
                  className="animate-spin h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
              ) : (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
              )}
            </button>
          </div>
          <p className="text-center text-gray-600 text-xs mt-2">
            Press Enter to send, Shift+Enter for new line. All content saved as
            draft.
          </p>
        </div>
      </div>
    </div>
  );
}
