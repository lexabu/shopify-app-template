(function () {
  var SESSION_KEY = "pf_session_id";
  var TRACKING_KEY = "pf_tracking_token";

  function getSessionId() {
    var existing = window.localStorage.getItem(SESSION_KEY);
    if (existing) {
      return existing;
    }
    var generated = "pf_" + Math.random().toString(36).slice(2);
    window.localStorage.setItem(SESSION_KEY, generated);
    return generated;
  }

  function setTrackingToken(token) {
    if (!token) {
      return;
    }
    window.localStorage.setItem(TRACKING_KEY, token);
    fetch("/cart/update.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attributes: { pf_tracking_token: token } }),
    }).catch(function () {
      return null;
    });
  }

  /**
   * Retry a fetch request with exponential backoff.
   * Only retries on transient failures (network errors, 5xx).
   * Does not retry on client errors (4xx) or rate limits (429).
   */
  function fetchWithRetry(url, options, maxRetries) {
    maxRetries = maxRetries || 3;

    function attempt(retryCount) {
      return fetch(url, options)
        .then(function (response) {
          // Don't retry on success or client errors (4xx)
          if (response.ok || (response.status >= 400 && response.status < 500)) {
            return response;
          }

          // Retry on server errors (5xx)
          if (response.status >= 500 && retryCount < maxRetries) {
            var delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
            console.log("Retrying request after " + delay + "ms (attempt " + (retryCount + 1) + "/" + maxRetries + ")");

            return new Promise(function (resolve) {
              setTimeout(function () {
                resolve(attempt(retryCount + 1));
              }, delay);
            });
          }

          // Max retries reached or non-retryable error
          return response;
        })
        .catch(function (error) {
          // Retry on network errors (connection failed, timeout, etc.)
          if (retryCount < maxRetries) {
            var delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
            console.log("Network error, retrying after " + delay + "ms (attempt " + (retryCount + 1) + "/" + maxRetries + ")");

            return new Promise(function (resolve, reject) {
              setTimeout(function () {
                attempt(retryCount + 1).then(resolve).catch(reject);
              }, delay);
            });
          }

          // Max retries reached, throw error
          throw error;
        });
    }

    return attempt(0);
  }

  function markdownLinksToHtml(text) {
    // Convert markdown links [text](url) to HTML <a> tags
    return text.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener" class="pf-chat-link">$1</a>'
    );
  }

  function appendMessage(container, text, role, showLoading) {
    var message = document.createElement("div");
    message.className = "pf-chat-message pf-chat-message--" + role;

    // Add loading class if needed
    if (showLoading) {
      message.classList.add("pf-chat-loading");
    }

    // Create content wrapper
    var contentWrapper = document.createElement("span");

    // For assistant messages, render markdown links as HTML
    if (role === "assistant") {
      contentWrapper.innerHTML = markdownLinksToHtml(text);
    } else {
      contentWrapper.textContent = text;
    }

    message.appendChild(contentWrapper);

    // Add spinner if loading
    if (showLoading) {
      var spinner = document.createElement("span");
      spinner.className = "pf-chat-spinner";
      spinner.innerHTML = '<span class="pf-chat-spinner-dot"></span><span class="pf-chat-spinner-dot"></span><span class="pf-chat-spinner-dot"></span>';
      message.appendChild(spinner);
    }

    container.appendChild(message);
    container.scrollTop = container.scrollHeight;
  }

  function appendProducts(container, products) {
    var list = document.createElement("div");
    list.className = "pf-chat-products";

    products.forEach(function (product) {
      var card = document.createElement("a");
      card.className = "pf-chat-product";
      card.href = product.product_url;
      card.target = "_blank";
      card.rel = "noopener";

      if (product.image_url) {
        var image = document.createElement("img");
        image.src = product.image_url;
        image.alt = product.title;
        card.appendChild(image);
      }

      var title = document.createElement("div");
      title.className = "pf-chat-product-title";
      title.textContent = product.title;
      card.appendChild(title);

      var price = document.createElement("div");
      price.className = "pf-chat-product-price";
      price.textContent = product.price + " " + product.currency;
      card.appendChild(price);

      list.appendChild(card);
    });

    container.appendChild(list);
  }

  function wireWidget(widget) {
    // Skip if already initialized
    if (widget.hasAttribute("data-pf-initialized")) {
      return;
    }
    widget.setAttribute("data-pf-initialized", "true");

    var shopDomain = widget.getAttribute("data-shop-domain");
    var welcomeMessage = widget.getAttribute("data-welcome-message") || "";
    var placeholderText =
      widget.getAttribute("data-placeholder-text") || "Ask a question";
    var primaryColor = widget.getAttribute("data-primary-color") || "#111111";

    widget.style.setProperty("--pf-primary", primaryColor);

    var messages = widget.querySelector(".pf-chat-messages");
    var form = widget.querySelector(".pf-chat-form");
    var input = widget.querySelector(".pf-chat-input");
    var submitButton = widget.querySelector(".pf-chat-send");
    var suggestionsContainer = widget.querySelector(".pf-chat-suggestions");

    if (!messages || !form || !input) {
      return;
    }

    var isLoading = false; // Track if a request is in progress

    input.placeholder = placeholderText;

    if (welcomeMessage) {
      appendMessage(messages, welcomeMessage, "assistant");
    }

    // Function to display suggestion bubbles
    function showSuggestions(queries) {
      if (!suggestionsContainer) {
        return;
      }

      // Clear existing suggestions
      suggestionsContainer.innerHTML = "";
      suggestionsContainer.classList.remove("pf-chat-suggestions--hidden");

      queries.forEach(function(query) {
        var bubble = document.createElement("button");
        bubble.className = "pf-chat-suggestion-bubble";
        bubble.textContent = query;
        bubble.type = "button";
        
        bubble.addEventListener("click", function() {
          if (isLoading) {
            return;
          }
          input.value = query;
          input.focus();
          form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        });
        
        suggestionsContainer.appendChild(bubble);
      });
    }

    // Function to show follow-up queries (replaces initial suggestions)
    function showFollowUpQueries(queries) {
      showSuggestions(queries);
    }

    // Fetch and initialize initial suggestion bubbles dynamically
    if (suggestionsContainer) {
      // Show loading state while fetching
      suggestionsContainer.innerHTML = '<span class="pf-chat-suggestions-loading">Loading suggestions...</span>';

      // Fetch suggestions from API
      fetch("/apps/product-finder/chat/suggestions?shop=" + encodeURIComponent(shopDomain))
        .then(function(response) {
          if (!response.ok) {
            throw new Error("Failed to fetch suggestions");
          }
          return response.json();
        })
        .then(function(data) {
          if (data.queries && Array.isArray(data.queries) && data.queries.length > 0) {
            showSuggestions(data.queries);
          } else {
            // Hide suggestions container if no queries returned
            suggestionsContainer.classList.add("pf-chat-suggestions--hidden");
          }
        })
        .catch(function(error) {
          console.error("Failed to load suggestions:", error);
          // Hide suggestions container on error
          suggestionsContainer.classList.add("pf-chat-suggestions--hidden");
        });
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      // Prevent multiple submissions while loading
      if (isLoading) {
        return;
      }

      var message = input.value.trim();
      if (!message) {
        return;
      }

      // Set loading state and disable input
      isLoading = true;
      input.disabled = true;
      if (submitButton) {
        submitButton.disabled = true;
      }

      input.value = "";
      appendMessage(messages, message, "user");
      appendMessage(messages, "Finding matches...", "assistant", true);

      var payload = {
        session_id: getSessionId(),
        message: message,
      };

      // Use Shopify app proxy URL - this will be proxied to your app
      // Retry up to 3 times on transient failures (network errors, 5xx)
      fetchWithRetry("/apps/product-finder/chat/query", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }, 3)
        .then(function (response) {
          // Check if response is OK before parsing
          if (!response.ok) {
            // Handle rate limiting and other errors
            return response.json()
              .then(function (errorData) {
                throw { status: response.status, data: errorData };
              })
              .catch(function (parseError) {
                // If JSON parsing fails, throw error with status but no data
                throw { status: response.status, data: null, message: response.statusText };
              });
          }
          return response.json().catch(function (parseError) {
            // Handle JSON parse errors for successful responses
            throw { status: 200, data: null, message: "Invalid response format" };
          });
        })
        .then(function (data) {
          messages.lastChild.remove();
          if (data.response_text) {
            appendMessage(messages, data.response_text, "assistant");
          }
          if (Array.isArray(data.products)) {
            appendProducts(messages, data.products);
          }
          setTrackingToken(data.tracking_token);

          // Show follow-up queries if available
          if (data.follow_up_queries && Array.isArray(data.follow_up_queries) && data.follow_up_queries.length > 0) {
            showFollowUpQueries(data.follow_up_queries);
          }

          // Re-enable input after successful response
          isLoading = false;
          input.disabled = false;
          if (submitButton) {
            submitButton.disabled = false;
          }
          input.focus();
        })
        .catch(function (error) {
          messages.lastChild.remove();

          var errorMessage;

          // Handle rate limiting specifically
          if (error.status === 429 && error.data && error.data.error) {
            errorMessage = error.data.error;
          }
          // Handle server errors (500, 502, 503, 504)
          else if (error.status >= 500 && error.status < 600) {
            errorMessage = "The server is having trouble right now. Please try again in a moment.";
          }
          // Handle other API errors with error messages
          else if (error.data && error.data.error) {
            errorMessage = error.data.error;
          }
          // Handle network/connection errors
          else if (!error.status && error.message) {
            if (error.message.includes("Failed to fetch") || error.message.includes("NetworkError")) {
              errorMessage = "Unable to connect. Please check your internet connection and try again.";
            } else if (error.message.includes("timeout")) {
              errorMessage = "Request timed out. Please try again.";
            } else {
              errorMessage = "Connection error. Please check your internet and try again.";
            }
          }
          // Generic error fallback
          else {
            errorMessage = "Sorry, something went wrong. Please try again.";
          }

          appendMessage(messages, errorMessage, "assistant");

          // Re-enable input after error
          isLoading = false;
          input.disabled = false;
          if (submitButton) {
            submitButton.disabled = false;
          }
          input.focus();
        });
    });

    var toggle = widget.querySelector(".pf-chat-toggle");
    var close = widget.querySelector(".pf-chat-close");
    if (toggle && close) {
      toggle.addEventListener("click", function () {
        widget.classList.add("pf-chat-popup--open");
      });
      close.addEventListener("click", function () {
        widget.classList.remove("pf-chat-popup--open");
      });
    }
  }

  function init() {
    var widgets = document.querySelectorAll(".pf-chat-widget, .pf-chat-popup");
    widgets.forEach(wireWidget);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
