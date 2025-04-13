
document.addEventListener('DOMContentLoaded', function() {
    // Elements
    const step1 = document.getElementById('step1');
    const step2 = document.getElementById('step2');
    const step3 = document.getElementById('step3');
    const step4 = document.getElementById('step4');
    const ingredientsInput = document.getElementById('ingredients');
    const findRecipesBtn = document.getElementById('findRecipes');
    const recipeResultsContainer = document.getElementById('recipeResults');
    const missingIngredientsContainer = document.getElementById('missingIngredients');
    const sendListBtn = document.getElementById('sendList');
    const startOverBtn = document.getElementById('startOver');
    const backToStep1Btn = document.getElementById('backToStep1');
    const backToStep2Btn = document.getElementById('backToStep2');
    const configButton = document.getElementById('configButton');
    const configPanel = document.getElementById('configPanel');
    const saveConfigBtn = document.getElementById('saveConfig');
    const errorDisplay = document.getElementById('error');
    const loading1 = document.getElementById('loading1');
    const loading2 = document.getElementById('loading2');
    const loading3 = document.getElementById('loading3');
    const confirmationMessage = document.getElementById('confirmationMessage');

    // API keys input fields
    const spoonacularKeyInput = document.getElementById('spoonacularKey');
    const telegramBotKeyInput = document.getElementById('telegramBotKey');
    const sendgridKeyInput = document.getElementById('sendgridKey');
    const geminiKeyInput = document.getElementById('geminiKey');

    // Delivery method radio buttons
    const telegramRadio = document.getElementById('telegram');
    const emailRadio = document.getElementById('email');
    const telegramOptions = document.getElementById('telegramOptions');
    const emailOptions = document.getElementById('emailOptions');

    // State storage (Enhanced version)
    let conversationHistory = {
        query1: '',
        llmResponse1: '',
        toolCall1: '',
        toolResult1: '',
        query2: '',
        llmResponse2: '',
        toolCall2: '',
        toolResult2: '',
        query3: '',
        llmResponse3: '',
        toolCall3: '', // Step 3 tool call description
        toolResult3: '', // Step 3 tool call result (e.g., success/error message from send API)
        finalResult: '', // Often same as toolResult3 or a summary
        // Adding self-check fields
        selfCheck1: '',
        selfCheck2: '',
        selfCheck3: '',
        // Adding reasoning type fields
        reasoningTypes1: [],
        reasoningTypes2: [],
        reasoningTypes3: [],
        // Adding error tracking fields (from LLM analysis)
        error1: '',
        error2: '',
        error3: '',
        // Adding uncertainty tracking (from LLM analysis)
        uncertainty1: '',
        uncertainty2: '',
        uncertainty3: '',
        // Add retry counters (for LLM calls)
        retryCount1: 0,
        retryCount2: 0,
        retryCount3: 0
    };

    let selectedRecipe = null;
    let missingIngredientsList = [];

    // Maximum number of retries for LLM calls
    const MAX_RETRIES = 3; // For Gemini LLM calls specifically

    // Maximum number of retries for external API calls (Spoonacular, Telegram, SendGrid)
    const MAX_API_RETRIES = 2; // For tool/external API calls

    // Error message templates (Enhanced version)
    const ERROR_MESSAGES = {
        NO_API_KEY: 'API key not found. Please add your API key in the configuration panel.',
        LLM_FAILURE: 'Unable to process your request via AI at this time. Using fallback logic.',
        INVALID_INGREDIENTS: 'Please enter valid ingredients, separated by commas.',
        API_RATE_LIMIT: 'API rate limit exceeded. Please try again later.',
        NETWORK_ERROR: 'Network error. Please check your internet connection.',
        UNCERTAIN_RESPONSE: 'AI Analysis Note: I\'m not entirely certain about this information.', // For display if needed
        TOOL_FAILURE: 'A required external service failed. Trying alternative approach.', // For display if needed
        GENERAL_ERROR: 'An unexpected error occurred. Please try again.',
        NO_RECIPES_FOUND: 'No recipes found with these ingredients. Try adding more common ingredients or check spelling.',
        INVALID_RECIPE_SELECTION: 'Invalid recipe selection. Please click on a recipe from the list.',
        INVALID_DELIVERY_DETAILS: 'Invalid delivery details provided. Please check your input.'
    };

    // Load saved API keys from storage
    chrome.storage.sync.get(['spoonacularKey', 'telegramBotKey', 'sendgridKey', 'geminiKey'], function(result) {
        if (result.spoonacularKey) spoonacularKeyInput.value = result.spoonacularKey;
        if (result.telegramBotKey) telegramBotKeyInput.value = result.telegramBotKey;
        if (result.sendgridKey) sendgridKeyInput.value = result.sendgridKey;
        if (result.geminiKey) geminiKeyInput.value = result.geminiKey;
    });

    // Toggle config panel
    configButton.addEventListener('click', function() {
        configPanel.style.display = configPanel.style.display === 'none' ? 'block' : 'none';
    });

    // Save configuration
    saveConfigBtn.addEventListener('click', function() {
        chrome.storage.sync.set({
            spoonacularKey: spoonacularKeyInput.value.trim(), // Trim keys on save
            telegramBotKey: telegramBotKeyInput.value.trim(),
            sendgridKey: sendgridKeyInput.value.trim(),
            geminiKey: geminiKeyInput.value.trim()
        }, function() {
            if (chrome.runtime.lastError) {
                 console.error("Error saving config:", chrome.runtime.lastError);
                 showMessage("Error saving configuration.", true);
            } else {
                 configPanel.style.display = 'none';
                 showMessage('Configuration saved successfully!', false, false); // Non-blocking success message
            }
        });
    });

    // Function to build a reasoning prompt wrapper for the LLM (Enhanced version)
    function buildReasoningPrompt(query, stage) {
        // Base reasoning prompt with reasoning type awareness
        let reasoningPrompt = `I want you to think step-by-step about this request. First, understand what is being asked. Then, analyze the information available to you. Consider what additional information or API calls might be needed. Explain your thinking process as you go.

        When responding to this query, break down the problem into components that require different types of reasoning, and for each component:
        1. Identify the type of reasoning required using [REASONING TYPE: X] tags, where X can be one of:
           - ARITHMETIC: For calculations, numerical operations, unit conversions
           - RETRIEVAL: For looking up or recalling specific facts or data points
           - COMPARISON: For comparing multiple options or features
           - LOGICAL: For deductive or inductive reasoning, if-then statements
           - CAUSAL: For cause-and-effect analysis
           - ANALOGICAL: For drawing parallels or applying knowledge from similar situations
           - CREATIVE: For generating new ideas or solutions
           - SOCIAL: For understanding user intentions, preferences, or communication
        2. Apply that reasoning type explicitly
        3. Explain your conclusion from that reasoning step

        Explicitly use these tags throughout your analysis to make your reasoning transparent.

        IMPORTANT: When you are uncertain about something, explicitly state your uncertainty using [UNCERTAINTY: X] tags, where X describes what you're uncertain about and your confidence level (low/medium/high). For example: [UNCERTAINTY: I'm moderately confident these are common cooking ingredients, but 'szechuan peppercorns' might be specialized].

        If you encounter information that's critical but missing, or if you can't determine something with confidence, use [ERROR: X] tags to flag this, where X describes the issue. For example: [ERROR: Cannot determine ingredient quantities from the provided information].`;

        // Add stage-specific self-check instructions
        if (stage === 1) {
            reasoningPrompt += `

        IMPORTANT: After your initial analysis, please perform a SELF-CHECK with these verification steps:
        1. Verify that you've correctly identified all the ingredients provided. Are they plausible cooking ingredients?
        2. Check if there are ambiguous ingredient names that might need clarification (e.g., 'apple' - what kind?).
        3. Confirm that searching for recipes with these ingredients is an appropriate action.
        4. Validate that the Spoonacular API (recipe search by ingredients) is the right tool for this query.

        Explicitly mark this section as "SELF-CHECK" and highlight any errors or adjustments needed before proceeding.

        ERROR HANDLING:
        - If ingredients appear invalid or unclear (e.g., non-food items, gibberish), flag this with [ERROR: Invalid ingredients provided: X] and suggest clarifications.
        - If you believe some ingredients might not be found in standard recipe databases, mark with [UNCERTAINTY: Ingredient X might be too niche].
        - If the intended tool (Spoonacular API) is known to be unavailable/failing, state this [ERROR: Spoonacular tool unavailable]. If tool access fails during execution, be prepared to provide general recipe suggestions based on common combinations of the ingredients provided.
        - If the tool call succeeds but returns no results, suggest adding more common ingredients to the list or checking spelling.`;
        } else if (stage === 2) {
            reasoningPrompt += `

        IMPORTANT: After your initial analysis, please perform a SELF-CHECK with these verification steps:
        1. Verify you have correctly identified the selected recipe title and ID from the previous step/context.
        2. Confirm you have the list of user's available ingredients from the previous step/context.
        3. Validate that the next logical step is to get the selected recipe's *required* ingredients.
        4. Check that comparing required and available ingredients is the appropriate action for determining missing items.
        5. Verify the Spoonacular API (get recipe information by ID) is the right tool for retrieving recipe details.

        Explicitly mark this section as "SELF-CHECK" and highlight any errors or adjustments needed before proceeding.

        ERROR HANDLING:
        - If the recipe ID seems invalid or missing from context, flag with [ERROR: Recipe ID missing or invalid] and suggest reselecting a recipe.
        - If the user's available ingredients list is missing, flag with [ERROR: User ingredients list missing].
        - If unable to retrieve full recipe details via the tool, mark with [ERROR: Failed to retrieve recipe details for ID X] and fall back to using whatever partial information is available or generating fallback ingredients based on title.
        - If uncertain about ingredient matching logic (e.g., "onion" vs "red onion"), mark with [UNCERTAINTY: Matching X vs Y might be imprecise] and use your best judgment.
        - If the API call fails entirely after retries, provide general guidance on common ingredients needed for this type of recipe (use ANALOGICAL reasoning).`;
        } else if (stage === 3) {
            reasoningPrompt += `

        IMPORTANT: After your initial analysis, please perform a SELF-CHECK with these verification steps:
        1. Verify you have correctly identified the intended delivery method (email or Telegram) from context.
        2. Confirm you have valid-looking delivery details (email address format or numeric chat ID) from context.
        3. Check that you have the list of missing ingredients (or confirmation of none missing) from the previous step/context.
        4. Validate that the selected recipe title is correctly carried over for context in the message.
        5. Verify the appropriate API tool (SendGrid or Telegram) is being selected based on the delivery method.

        Explicitly mark this section as "SELF-CHECK" and highlight any errors or adjustments needed before proceeding.

        ERROR HANDLING:
        - If delivery details appear invalid (malformed email, non-numeric chat ID), flag with [ERROR: Invalid delivery details: X].
        - If the missing ingredients list is missing from context, flag with [ERROR: Missing ingredients list unavailable].
        - If the missing ingredients list is empty, confirm this is okay and the message should reflect that.
        - If the delivery API tool call fails after retries, mark with [ERROR: Failed to send via X API] and inform the user the list could not be sent.
        - If uncertain about ingredient measurements or details in the list, mark with [UNCERTAINTY: Details for ingredient X are estimates] and provide your best estimate.`;
        }

        // Add the query
        reasoningPrompt += `

        Here is the query/context to respond to:
        ${query}

        Please structure your response with clearly labeled reasoning types using [REASONING TYPE: X] tags, include your SELF-CHECK section, flag any uncertainties with [UNCERTAINTY: X] tags, mark any errors with [ERROR: X] tags, and then conclude with the most helpful answer or action plan.`;

        return reasoningPrompt;
    }

    // Function to extract reasoning metadata, errors, and uncertainties from LLM response (Enhanced version)
    function extractReasoningMetadata(llmResponse) {
        if (typeof llmResponse !== 'string') {
             console.warn("extractReasoningMetadata received non-string input:", llmResponse);
             return { selfCheck: 'Invalid input', reasoningTypes: [], uncertainties: '', errors: 'Invalid input' };
        }

        // Extract self-check section
        const selfCheckRegex = /SELF-CHECK(?::|)\s*([\s\S]*?)(?:\n\n|ERROR HANDLING:|Here is the query|Please structure|\Z)/i; // More robust end anchors
        const selfCheckMatch = llmResponse.match(selfCheckRegex);
        const selfCheck = selfCheckMatch ? selfCheckMatch[1].trim() : "No explicit self-check section found.";

        // Extract reasoning types used
        const reasoningTypesRegex = /\[REASONING TYPE:\s*([A-Z_]+)\]/g; // Allow underscore in type name potentially
        const reasoningMatches = [...llmResponse.matchAll(reasoningTypesRegex)];
        const reasoningTypes = reasoningMatches.map(match => match[1]);
        const uniqueReasoningTypes = [...new Set(reasoningTypes)];

        // Extract uncertainties
        const uncertaintyRegex = /\[UNCERTAINTY:\s*(.*?)\]/g;
        const uncertaintyMatches = [...llmResponse.matchAll(uncertaintyRegex)];
        const uncertainties = uncertaintyMatches.map(match => match[1].trim());
        const uniqueUncertainties = [...new Set(uncertainties)];
        const uncertaintyStr = uniqueUncertainties.join('; ') || ''; // Ensure it's never null/undefined

        // Extract errors
        const errorRegex = /\[ERROR:\s*(.*?)\]/g;
        const errorMatches = [...llmResponse.matchAll(errorRegex)];
        const errors = errorMatches.map(match => match[1].trim());
        const uniqueErrors = [...new Set(errors)];
        const errorStr = uniqueErrors.join('; ') || ''; // Ensure it's never null/undefined

        return {
            selfCheck: selfCheck,
            reasoningTypes: uniqueReasoningTypes,
            uncertainties: uncertaintyStr,
            errors: errorStr
        };
    }

    // Enhanced simulateLLMResponse function with error handling, retries, and fallbacks
    async function simulateLLMResponse(query, stage = 1) {
        const reasoningPrompt = buildReasoningPrompt(query, stage);

        console.log(`==== COMPLETE LLM PROMPT (STAGE ${stage}) ====`);
        console.log(reasoningPrompt);
        console.log("============================");

        let retryCount = stage === 1 ? conversationHistory.retryCount1 :
                         stage === 2 ? conversationHistory.retryCount2 :
                         conversationHistory.retryCount3;

        try {
            const result = await new Promise((resolve, reject) => {
                chrome.storage.sync.get(['geminiKey'], data => {
                     if (chrome.runtime.lastError) {
                          reject(new Error("Error getting Gemini key: " + chrome.runtime.lastError.message));
                     } else {
                          resolve(data);
                     }
                 });
            });

            if (!result || !result.geminiKey) {
                console.log("Gemini API key not found in storage. Using fallback response.");
                // Use await here in case fallback becomes async
                return await simulateFallbackResponse(query, stage);
            }

            const apiKey = result.geminiKey;
            // Using 1.5 Flash is a good choice for speed/cost balance
            const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent'; // Use -latest tag

            console.log(`Sending request to Gemini API (Stage ${stage}, Attempt ${retryCount + 1})...`);

            const response = await fetch(`${apiUrl}?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: reasoningPrompt }] }],
                    // Consider adding safety settings if needed
                    // safetySettings: [
                    //   { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                    //   // Add others as needed
                    // ],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 2048,
                         // topP: 0.9, // Optional alternative to temperature
                         // topK: 40, // Optional
                    }
                })
            });

            if (!response.ok) {
                 let errorData = { error: { message: `HTTP ${response.status}: ${response.statusText}` } };
                 try {
                    const errorJson = await response.json();
                     // Use detailed error if available
                     if (errorJson && errorJson.error) {
                         errorData = errorJson;
                     }
                 } catch (e) { console.error("Could not parse Gemini error response JSON:", e); }
                throw new Error(`Gemini API error (${response.status}): ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            console.log("Received response from Gemini API:", data);

             // More robust checks for response content and potential blocks
             if (!data.candidates || data.candidates.length === 0) {
                 // Check for prompt feedback block first
                 if (data.promptFeedback && data.promptFeedback.blockReason) {
                    throw new Error(`Gemini API request blocked due to prompt: ${data.promptFeedback.blockReason}. Details: ${JSON.stringify(data.promptFeedback.safetyRatings)}`);
                 }
                 throw new Error('Gemini API response missing candidates.');
             }

             const candidate = data.candidates[0];

             if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0 || !candidate.content.parts[0].text) {
                 // Check for finish reason block
                 if (candidate.finishReason && candidate.finishReason !== 'STOP') {
                     throw new Error(`Gemini API generation stopped due to: ${candidate.finishReason}. Safety Ratings: ${JSON.stringify(candidate.safetyRatings)}`);
                 }
                 throw new Error('Invalid or empty response structure received from Gemini API.');
             }


            let responseText = candidate.content.parts[0].text;

            const metadata = extractReasoningMetadata(responseText);
            console.log(`SELF-CHECK (STAGE ${stage}):`, metadata.selfCheck);
            console.log(`REASONING TYPES USED (STAGE ${stage}):`, metadata.reasoningTypes);
            console.log(`UNCERTAINTIES (STAGE ${stage}):`, metadata.uncertainties);
            console.log(`ERRORS (STAGE ${stage}):`, metadata.errors);

            // Store results in conversation history
            const historyUpdate = {
                [`llmResponse${stage}`]: responseText,
                [`selfCheck${stage}`]: metadata.selfCheck,
                [`reasoningTypes${stage}`]: metadata.reasoningTypes,
                [`uncertainty${stage}`]: metadata.uncertainties,
                [`error${stage}`]: metadata.errors,
                [`retryCount${stage}`]: 0 // Reset retry counter on success
            };
            Object.assign(conversationHistory, historyUpdate);


            // Display non-blocking warnings based on LLM-identified issues
            if (metadata.errors) {
                showMessage(`AI Analysis Warning: ${metadata.errors}`, true, false);
            }
            if (metadata.uncertainties) {
                // Optionally show uncertainty as a non-blocking info message
                // showMessage(`${ERROR_MESSAGES.UNCERTAIN_RESPONSE} ${metadata.uncertainties}`, false, false);
                console.log(`AI Uncertainties (Stage ${stage}): ${metadata.uncertainties}`);
            }

            return responseText;

        } catch (error) {
            console.error(`Error calling Gemini API (Stage ${stage}, Attempt ${retryCount + 1}):`, error);

            // Increment retry counter for the specific stage
             const retryUpdate = { [`retryCount${stage}`]: retryCount + 1 };
             Object.assign(conversationHistory, retryUpdate);


            if (retryCount < MAX_RETRIES) {
                console.log(`Retrying LLM call (Attempt ${retryCount + 2} of ${MAX_RETRIES + 1})...`);
                const delay = 1000 * Math.pow(2, retryCount) + Math.random() * 500; // Exponential backoff with jitter
                await new Promise(resolve => setTimeout(resolve, delay));
                return simulateLLMResponse(query, stage); // Recursive call
            }

            console.log(`Maximum LLM retries (${MAX_RETRIES}) exceeded for stage ${stage}. Falling back.`);
            showMessage(ERROR_MESSAGES.LLM_FAILURE, true, false); // Non-blocking error
            // Use await here in case fallback becomes async
            return await simulateFallbackResponse(query, stage);
        }
    }

    // Enhanced fallback response function
    function simulateFallbackResponse(query, stage) {
        console.log(`Generating fallback response for stage ${stage}`);
        let response = "";
        let ingredients = [];
        try {
            if (query.includes("I have")) {
                const match = query.match(/I have (.*?)(?:\.|\?|$|LLM Response:)/);
                if (match && match[1]) {
                    ingredients = match[1].split(',').map(i => i.trim()).filter(i => i);
                }
            }
        } catch (e) { console.error("Error parsing ingredients in fallback:", e); }

        let recipeTitle = "the recipe";
         try {
            if (query.includes("recipe:")) {
                const match = query.match(/recipe: (.*?)(?:\(|\.|\?|$|LLM Response:)/);
                if (match && match[1]) {
                    recipeTitle = match[1].trim();
                }
            }
        } catch (e) { console.error("Error parsing recipe title in fallback:", e); }


        // Stage-specific fallback responses
        if (stage === 1) {
            const ingredientList = ingredients.length > 0 ? ingredients.join(', ') : "your ingredients";
            response = `[REASONING TYPE: RETRIEVAL] Identified ingredients: ${ingredientList}.
[REASONING TYPE: LOGICAL] Next step is to search for recipes using these ingredients.
[REASONING TYPE: SOCIAL] The goal is to provide recipe suggestions to the user.

SELF-CHECK:
1. Ingredients: ${ingredientList}. (Assumed valid).
2. Ambiguity check: N/A (Fallback).
3. Action: Recipe search is appropriate.
4. Tool: Spoonacular API is the intended tool.
[UNCERTAINTY: High - Cannot validate ingredients or search without API].
[ERROR: None detected in input query structure].

Okay, I see you have ${ingredientList}. I will now proceed to search for recipes using the Spoonacular tool (simulated for fallback).`;
        } else if (stage === 2) {
            response = `[REASONING TYPE: RETRIEVAL] Selected recipe: ${recipeTitle}. User ingredients are known from context.
[REASONING TYPE: LOGICAL] Need to find required ingredients for ${recipeTitle} and compare with user's ingredients.
[REASONING TYPE: SOCIAL] Goal is to create a missing ingredients list for the user.

SELF-CHECK:
1. Recipe: ${recipeTitle}. (Assumed valid selection).
2. User ingredients: Available from context (assumed).
3. Action: Get recipe details is the next step.
4. Comparison: Correct method for missing items.
5. Tool: Spoonacular API (recipe info) is intended.
[UNCERTAINTY: High - Cannot get actual recipe ingredients or perform accurate comparison without API].
[ERROR: None detected in input query structure].

Alright, for the recipe ${recipeTitle}, I will now determine the missing ingredients based on what you provided earlier (simulated for fallback).`;
        } else if (stage === 3) {
            let deliveryMethod = "your preferred method";
            let deliveryDetails = "the provided details";
             try {
                if (query.includes("via telegram to")) {
                    deliveryMethod = "Telegram";
                    const match = query.match(/via telegram to ([-0-9]+)/); // More specific match for chat ID
                    if (match && match[1]) deliveryDetails = match[1].trim();
                } else if (query.includes("via email to")) {
                    deliveryMethod = "email";
                     const match = query.match(/via email to ([^\s]+@[^\s]+)/); // Basic email match
                    if (match && match[1]) deliveryDetails = match[1].trim();
                }
            } catch (e) { console.error("Error parsing delivery details in fallback:", e); }


            response = `[REASONING TYPE: RETRIEVAL] Delivery: ${deliveryMethod} to ${deliveryDetails}. Missing ingredients list from context. Recipe: ${recipeTitle}.
[REASONING TYPE: LOGICAL] Select appropriate API tool (Telegram/SendGrid) based on method. Format message.
[REASONING TYPE: SOCIAL] Send the formatted list to the user.

SELF-CHECK:
1. Method: ${deliveryMethod}.
2. Details: ${deliveryDetails}. (Assumed format is correct for fallback).
3. List: Available from context (assumed).
4. Recipe context: ${recipeTitle}.
5. Tool: Correct API selection based on method.
[UNCERTAINTY: High - Cannot validate details or guarantee successful send without API].
[ERROR: None detected in input query structure].

Okay, preparing to send the shopping list for ${recipeTitle} via ${deliveryMethod} to ${deliveryDetails} (simulated for fallback).`;
        } else {
            response = `[REASONING TYPE: LOGICAL] Processing request (unknown stage fallback).

SELF-CHECK:
General verification. Proceeding.
[UNCERTAINTY: High - Specific context unclear].
[ERROR: None].

Handling your request (simulated fallback).`;
        }

        return response; // Return the simulated response string
    }


    // ===== API Functions (Enhanced Versions with MAX_API_RETRIES) =====

    async function fetchRecipesByIngredients(ingredients, apiKey, retryCount = 0) {
        // Uses MAX_API_RETRIES
        try {
            if (!ingredients || typeof ingredients !== 'string' || ingredients.trim().length === 0) {
                console.warn("fetchRecipesByIngredients: Invalid ingredients input.");
                return [];
            }
            const ingredientsParam = ingredients.split(',')
                .map(i => i.trim()).filter(i => i.length > 0).join(','); // Use comma for Spoonacular
            if (!ingredientsParam) {
                 console.warn("fetchRecipesByIngredients: No valid ingredients after processing.");
                 return [];
            }

            const url = `https://api.spoonacular.com/recipes/findByIngredients?ingredients=${encodeURIComponent(ingredientsParam)}&number=5&ranking=1&apiKey=${apiKey}`;
            console.log(`Fetching recipes (API Attempt ${retryCount + 1}/${MAX_API_RETRIES + 1})`);

            const response = await fetch(url);

            if (response.status === 429) {
                if (retryCount < MAX_API_RETRIES) {
                    console.log(`Rate limit (429) hit fetching recipes, retrying after delay...`);
                    const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return fetchRecipesByIngredients(ingredients, apiKey, retryCount + 1);
                } else {
                    throw new Error(ERROR_MESSAGES.API_RATE_LIMIT);
                }
            }
             if (response.status === 401 || response.status === 403) {
                 throw new Error(`Spoonacular API key invalid/unauthorized (Status ${response.status}).`);
             }
             if (!response.ok) {
                 throw new Error(`Spoonacular API error fetching recipes: ${response.status} ${response.statusText}`);
             }

            const data = await response.json();
            if (!data || !Array.isArray(data)) {
                 console.warn("Received non-array data from Spoonacular findByIngredients:", data);
                 return [];
            }
            return data; // Can be empty array if no results found

        } catch (error) {
            console.error("Error in fetchRecipesByIngredients:", error);
            if ((error instanceof TypeError || error.message.includes('fetch')) && retryCount < MAX_API_RETRIES) {
                console.log(`Network error fetching recipes, retrying (Attempt ${retryCount + 2})...`);
                const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
                return fetchRecipesByIngredients(ingredients, apiKey, retryCount + 1);
            }
             // Let specific errors like rate limit or auth propagate if retries exhausted
             if (error.message === ERROR_MESSAGES.API_RATE_LIMIT || error.message.includes('unauthorized')) {
                  throw error;
             }
            // Throw a generic error for others
            throw new Error(`Failed to fetch recipes: ${error.message || 'Unknown error'}`);
        }
    }

    async function fetchMissingIngredients(recipeId, userIngredients, apiKey, retryCount = 0) {
         // Uses MAX_API_RETRIES
        try {
            if (!recipeId || isNaN(parseInt(recipeId))) {
                throw new Error('Invalid recipe ID provided');
            }
             userIngredients = Array.isArray(userIngredients)
                 ? userIngredients.map(ing => String(ing).trim()).filter(ing => ing.length > 0)
                 : [];

            const url = `https://api.spoonacular.com/recipes/${recipeId}/information?includeNutrition=false&apiKey=${apiKey}`;
            console.log(`Fetching recipe info ID ${recipeId} (API Attempt ${retryCount + 1}/${MAX_API_RETRIES + 1})`);

            const response = await fetch(url);

            if (response.status === 429) {
                if (retryCount < MAX_API_RETRIES) {
                     console.log(`Rate limit (429) hit fetching recipe info, retrying...`);
                     const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
                     await new Promise(resolve => setTimeout(resolve, delay));
                     return fetchMissingIngredients(recipeId, userIngredients, apiKey, retryCount + 1);
                } else {
                    throw new Error(ERROR_MESSAGES.API_RATE_LIMIT);
                }
            }
            if (response.status === 401 || response.status === 403) {
                throw new Error(`Spoonacular API key invalid/unauthorized fetching recipe info (Status ${response.status}).`);
            }
            if (response.status === 404) {
                throw new Error(`Recipe with ID ${recipeId} not found (404).`);
            }
            if (!response.ok) {
                throw new Error(`API error fetching recipe info: ${response.status} ${response.statusText}`);
            }

            const recipeInfo = await response.json();
            if (!recipeInfo || !recipeInfo.extendedIngredients || !Array.isArray(recipeInfo.extendedIngredients)) {
                console.warn(`Recipe info ID ${recipeId} lacks 'extendedIngredients'. Using fallback.`);
                return generateFallbackIngredients(recipeInfo?.title || `Recipe ID ${recipeId}`);
            }

            const requiredIngredients = recipeInfo.extendedIngredients;
            const missingIngredients = requiredIngredients.filter(reqIng => {
                if (!reqIng || typeof reqIng.name !== 'string' || !reqIng.name.trim()) return false;
                const reqNameLower = reqIng.name.toLowerCase().trim();
                 if (!reqNameLower) return false;
                 // Improved matching logic
                 return !userIngredients.some(userIng => {
                     const userIngLower = userIng.toLowerCase().trim();
                     if (!userIngLower) return false;
                      // Check for direct inclusion or singular/plural forms (simple check)
                      if (reqNameLower.includes(userIngLower) || userIngLower.includes(reqNameLower)) return true;
                      if (reqNameLower.endsWith('s') && userIngLower === reqNameLower.slice(0, -1)) return true;
                      if (userIngLower.endsWith('s') && reqNameLower === userIngLower.slice(0, -1)) return true;
                     // Check word overlap (more lenient)
                     const reqWords = reqNameLower.split(' ').filter(w => w.length > 2);
                     const userWords = userIngLower.split(' ').filter(w => w.length > 2);
                      if (reqWords.length > 0 && userWords.length > 0 && reqWords.some(rw => userWords.includes(rw))) return true;

                     return false;
                 });
            }).map(ing => ({
                id: ing.id || 0,
                name: ing.name || 'unknown ingredient',
                amount: ing.amount !== undefined ? ing.amount : 1,
                unit: ing.unit || ''
            }));

            console.log(`Found ${missingIngredients.length} missing ingredients for recipe ID ${recipeId}.`);
            return missingIngredients;

        } catch (error) {
             console.error("Error in fetchMissingIngredients:", error);
             if ((error instanceof TypeError || error.message.includes('fetch')) && retryCount < MAX_API_RETRIES) {
                 console.log(`Network error fetching recipe info, retrying (Attempt ${retryCount + 2})...`);
                 const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
                 await new Promise(resolve => setTimeout(resolve, delay));
                 return fetchMissingIngredients(recipeId, userIngredients, apiKey, retryCount + 1);
             }
             // Let specific errors propagate
             if (error.message === ERROR_MESSAGES.API_RATE_LIMIT ||
                 error.message.includes('unauthorized') ||
                 error.message.includes('not found (404)')) {
                 throw error;
             }
             // Use fallback for other errors after retries
             console.warn("Falling back to generated ingredients due to error:", error.message);
             showMessage("Could not get exact ingredients, using estimate.", true, false);
             return generateFallbackIngredients(selectedRecipe?.title || `Recipe ID ${recipeId}`); // Use selectedRecipe title if available
        }
    }

    async function sendShoppingList(method, destination, recipeTitle, ingredients, apiKey, retryCount = 0) {
         // Uses MAX_API_RETRIES
        try {
            // Validation
            if (!method || (method !== 'telegram' && method !== 'email')) throw new Error('Invalid delivery method');
            if (!destination || typeof destination !== 'string' || !destination.trim()) throw new Error(`Missing destination ${method} details`);
            if (method === 'email' && !validateEmail(destination)) throw new Error(ERROR_MESSAGES.INVALID_DELIVERY_DETAILS + ' (Bad email format)');
            if (method === 'telegram' && !/^-?\d+$/.test(destination)) throw new Error(ERROR_MESSAGES.INVALID_DELIVERY_DETAILS + ' (Chat ID must be numeric)');
             if (!apiKey) throw new Error(`Missing API key for ${method}`);

            recipeTitle = recipeTitle || 'Your Recipe';
            ingredients = Array.isArray(ingredients) ? ingredients : [];

            const shoppingListText = `Shopping List for: ${recipeTitle}\n\n` +
                (ingredients.length > 0
                    ? ingredients.map(item => `- ${item?.amount ?? ''} ${item?.unit ?? ''} ${item?.name ?? 'Unknown Item'}`.trim().replace(/ +/g, ' ')).join('\n') // Sanitize output
                    : '(You seem to have all the ingredients!)');

            console.log(`Sending list via ${method} to ${destination} (API Attempt ${retryCount + 1}/${MAX_API_RETRIES + 1})`);

            let response;
            let successMessage = '';
            if (method === 'telegram') {
                const url = `https://api.telegram.org/bot${apiKey}/sendMessage`;
                const payload = { chat_id: destination, text: shoppingListText, parse_mode: 'Markdown' }; // Or remove parse_mode for plain text
                response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                successMessage = 'Shopping list sent successfully via Telegram!';
            } else { // email
                const url = 'https://api.sendgrid.com/v3/mail/send';
                const payload = {
                    personalizations: [{ to: [{ email: destination }] }],
                    from: { email: 'recipe-suggester-bot@example.com', name: 'Recipe Suggester' }, // IMPORTANT: Replace with a verified sender in SendGrid
                    subject: `Shopping List for ${recipeTitle}`,
                    content: [{ type: 'text/plain', value: shoppingListText }]
                };
                 response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }, body: JSON.stringify(payload) });
                 successMessage = 'Shopping list sent successfully via Email!';
            }

            // --- Common Response Handling ---
            if (response.status === 429) { // Rate Limit
                if (retryCount < MAX_API_RETRIES) {
                    console.log(`${method} rate limit (429), retrying...`);
                    let delay = Math.pow(2, retryCount) * 2000 + Math.random() * 1000; // Default backoff
                    if (method === 'telegram') {
                         try { // Check for Telegram's retry_after
                             const errorData = await response.clone().json(); // Clone response to read body
                             if (errorData.parameters && errorData.parameters.retry_after) {
                                 delay = errorData.parameters.retry_after * 1000 + 500;
                                 console.log(`Using Telegram retry_after: ${errorData.parameters.retry_after}s`);
                             }
                         } catch (e) {}
                     }
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return sendShoppingList(method, destination, recipeTitle, ingredients, apiKey, retryCount + 1);
                } else {
                    throw new Error(`${method} API rate limit exceeded.`);
                }
            }

            // Auth Errors
             if (response.status === 401 || response.status === 403) {
                  throw new Error(`${method} API key invalid or unauthorized (Status ${response.status}). Check configuration.`);
             }

            // Specific Telegram Errors
            if (method === 'telegram' && !response.ok) {
                 let errorDescription = `Status ${response.status}`;
                 try {
                     const errorData = await response.json();
                     errorDescription = errorData.description || errorDescription;
                     if (errorData.error_code === 400 && errorDescription.includes('chat not found')) throw new Error('Telegram Error: Chat ID not found or invalid.');
                     if (errorData.error_code === 403 && errorDescription.includes('bot was blocked')) throw new Error('Telegram Error: Bot blocked by user.');
                 } catch (e) { if(e.message.startsWith('Telegram Error:')) throw e; }
                 throw new Error(`Telegram API error: ${errorDescription}`);
             }

            // Specific SendGrid Errors (expects 202)
             if (method === 'email' && response.status !== 202) {
                  let errorMessage = `SendGrid API error: ${response.status} ${response.statusText}`;
                  try {
                      const errorData = await response.json();
                      if (errorData.errors && errorData.errors.length > 0) {
                          errorMessage = `SendGrid Error(s): ${errorData.errors.map(e => e.message).join('; ')}`;
                           if (errorMessage.includes('valid email address')) errorMessage = 'SendGrid Error: Invalid recipient email format.';
                           if (errorMessage.includes('verified sender') || errorMessage.includes('authenticate')) errorMessage = 'SendGrid Error: Sender email not verified. Check SendGrid setup.';
                      }
                  } catch (e) {}
                  throw new Error(errorMessage);
              }

            // Success (Telegram OK, SendGrid 202)
            console.log(`${method} send successful.`);
            return successMessage;

        } catch (error) {
            console.error(`Error in sendShoppingList (${method}):`, error);
             if ((error instanceof TypeError || error.message.includes('fetch')) && retryCount < MAX_API_RETRIES) {
                 console.log(`Network error sending ${method}, retrying (Attempt ${retryCount + 2})...`);
                 const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
                 await new Promise(resolve => setTimeout(resolve, delay));
                 return sendShoppingList(method, destination, recipeTitle, ingredients, apiKey, retryCount + 1);
             }
            // Let specific, informative errors propagate
            if (error.message.includes('rate limit') || error.message.includes('unauthorized') ||
                error.message.includes('Chat ID not found') || error.message.includes('Bot blocked') ||
                error.message.includes('Invalid recipient') || error.message.includes('verified sender')) {
                throw error;
            }
            // Throw generic for others
             throw new Error(`Failed to send shopping list via ${method}: ${error.message || 'Unknown error'}`);
        }
    }


    // ----- Utility Functions -----

    function validateEmail(email) {
        if (!email || typeof email !== 'string') return false;
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email.trim());
    }

    // Function to validate ingredients input (basic check) - USED in findRecipesBtn
    function ingredientsAreValid(ingredients) {
        if (!ingredients || typeof ingredients !== 'string') return false;
        // Check if there's at least one non-empty item after splitting and trimming
        return ingredients.split(',').some(item => item.trim().length > 0);
    }

    // Function to generate fallback ingredients (COMPLETE VERSION)
    function generateFallbackIngredients(recipeTitle) {
        console.log(`Generating fallback ingredients for title: "${recipeTitle}"`);
        if (typeof recipeTitle !== 'string') recipeTitle = '';
        const title = recipeTitle.toLowerCase();

        let fallbackIngredients = [
            { id: 0, name: "(Estimate) Salt", amount: 1, unit: "tsp" }, // Mark as estimate
            { id: 0, name: "(Estimate) Pepper", amount: 0.5, unit: "tsp" },
            { id: 0, name: "(Estimate) Cooking Oil", amount: 1, unit: "tbsp" }
        ];

        if (title.includes("pasta") || title.includes("spaghetti") || title.includes("lasagna") || title.includes("macaroni")) {
            fallbackIngredients.push(
                { id: 0, name: "(Estimate) Pasta", amount: 8, unit: "oz" },
                { id: 0, name: "(Estimate) Tomato Sauce", amount: 1, unit: "can" },
                { id: 0, name: "(Estimate) Onion", amount: 0.5, unit: "medium" },
                { id: 0, name: "(Estimate) Garlic", amount: 1, unit: "clove" }
            );
             if (title.includes("cheese") || title.includes("lasagna")) {
                  fallbackIngredients.push({ id: 0, name: "(Estimate) Cheese", amount: 1, unit: "cup" });
             }
        } else if (title.includes("chicken") || title.includes("pollo")) {
            fallbackIngredients.push(
                { id: 0, name: "(Estimate) Chicken", amount: 1, unit: "lb" },
                { id: 0, name: "(Estimate) Onion", amount: 0.5, unit: "medium" },
                { id: 0, name: "(Estimate) Garlic", amount: 2, unit: "cloves" }
            );
             if (title.includes("roast") || title.includes("baked")) {
                  fallbackIngredients.push({ id: 0, name: "(Estimate) Herbs (e.g., rosemary, thyme)", amount: 1, unit: "tbsp" });
             }
        } else if (title.includes("beef") || title.includes("steak") || title.includes("burger")) {
             fallbackIngredients.push(
                 { id: 0, name: "(Estimate) Ground Beef or Steak", amount: 1, unit: "lb" },
                 { id: 0, name: "(Estimate) Onion", amount: 0.5, unit: "medium" }
             );
              if (title.includes("burger")) {
                   fallbackIngredients.push({ id: 0, name: "(Estimate) Burger Buns", amount: 4, unit: "" });
               }
        } else if (title.includes("soup") || title.includes("stew") || title.includes("chili")) {
            fallbackIngredients.push(
                { id: 0, name: "(Estimate) Broth (vegetable or chicken)", amount: 4, unit: "cups" },
                { id: 0, name: "(Estimate) Carrots", amount: 2, unit: "" },
                { id: 0, name: "(Estimate) Celery", amount: 2, unit: "stalks" },
                { id: 0, name: "(Estimate) Onion", amount: 1, unit: "" }
            );
            if (title.includes("chili")) {
                fallbackIngredients.push({ id: 0, name: "(Estimate) Beans (e.g., kidney, black)", amount: 1, unit: "can" });
                fallbackIngredients.push({ id: 0, name: "(Estimate) Diced Tomatoes", amount: 1, unit: "can" });
                fallbackIngredients.push({ id: 0, name: "(Estimate) Chili Powder", amount: 1, unit: "tbsp" });
            }
        } else if (title.includes("salad")) {
            fallbackIngredients.push(
                { id: 0, name: "(Estimate) Lettuce or Greens", amount: 5, unit: "oz" },
                { id: 0, name: "(Estimate) Cucumber", amount: 0.5, unit: "" },
                { id: 0, name: "(Estimate) Tomatoes", amount: 1, unit: "" },
                { id: 0, name: "(Estimate) Salad Dressing", amount: 0.25, unit: "cup" }
            );
        } else if (title.includes("pizza")) {
            fallbackIngredients.push(
                { id: 0, name: "(Estimate) Pizza Dough", amount: 1, unit: "" },
                { id: 0, name: "(Estimate) Pizza Sauce", amount: 0.5, unit: "cup" },
                { id: 0, name: "(Estimate) Mozzarella Cheese", amount: 8, unit: "oz" }
            );
        } else if (title.includes("cake") || title.includes("cupcake") || title.includes("muffin") || title.includes("cookie") || title.includes("brownie")) {
            fallbackIngredients.push(
                { id: 0, name: "(Estimate) All-Purpose Flour", amount: 1.5, unit: "cups" },
                { id: 0, name: "(Estimate) Sugar", amount: 1, unit: "cup" },
                { id: 0, name: "(Estimate) Butter or Oil", amount: 0.5, unit: "cup" },
                { id: 0, name: "(Estimate) Eggs", amount: 2, unit: "" },
                { id: 0, name: "(Estimate) Baking Soda or Powder", amount: 1, unit: "tsp" },
                { id: 0, name: "(Estimate) Vanilla Extract", amount: 1, unit: "tsp" }
            );
             if (title.includes("chocolate") || title.includes("brownie")) {
                 fallbackIngredients.push({ id: 0, name: "(Estimate) Cocoa Powder or Chocolate Chips", amount: 0.5, unit: "cup" });
             }
        }

        return fallbackIngredients;
    }

    // Function to format shopping list for display in the UI
    function formatShoppingListForDisplay(ingredients) { // Removed recipeTitle param, not needed here
        if (!ingredients || ingredients.length === 0) {
            return "<p>(No missing ingredients needed for this recipe!)</p>"; // Slightly different message
        }

        // Check if it contains estimated ingredients
        const isEstimate = ingredients.some(ing => ing && ing.name && ing.name.toLowerCase().includes('(estimate)'));

        let listHtml = "";
        if (isEstimate) {
            listHtml += "<p class='fallback-notice'><strong>Note:</strong> Could not retrieve exact ingredients. This is an estimate:</p>";
        }

        listHtml += "<ul class='ingredients-list'>"; // Reused class from displayMissingIngredients
        ingredients.forEach(ingredient => {
            if (!ingredient) return; // Skip null/undefined
            // Sanitize display
            const amount = ingredient.amount ?? '';
            const unit = ingredient.unit || '';
            const name = ingredient.name || 'Unknown Ingredient';
             // Clean up potential extra spaces
             const text = `${amount} ${unit} ${name}`.trim().replace(/ +/g, ' ');
            listHtml += `<li>${text}</li>`;
        });
        listHtml += "</ul>";

        return listHtml;
    }

    // Function to display recipes with fallback handling (Enhanced version)
    function displayRecipes(recipes) {
        recipeResultsContainer.innerHTML = ''; // Clear previous results

        if (!recipes || !Array.isArray(recipes) || recipes.length === 0) {
            recipeResultsContainer.innerHTML = `
                <div class="no-results">
                    <p>${ERROR_MESSAGES.NO_RECIPES_FOUND}</p>
                    <p>Suggestions:</p>
                    <ul>
                        <li>Check ingredient spelling</li>
                        <li>Include basic items (oil, salt, onion)</li>
                        <li>Add a main component (chicken, pasta, beans)</li>
                        <li>Try fewer, more common ingredients</li>
                    </ul>
                </div>`;
            return;
        }

        recipes.forEach(recipe => {
            // Handle potential missing data gracefully
            const title = recipe.title || 'Untitled Recipe';
            const imageUrl = recipe.image || 'images/placeholder-recipe.png'; // Use a local placeholder
            const usedCount = recipe.usedIngredientCount ?? 0;
            const missingCount = recipe.missedIngredientCount ?? 0;
            const recipeId = recipe.id; // Make sure ID exists

            if (!recipeId) {
                console.warn("Recipe found without an ID, skipping display:", recipe);
                return; // Cannot select recipe without an ID
            }

            const recipeCard = document.createElement('div');
            recipeCard.className = 'recipe-card';
            recipeCard.setAttribute('data-recipe-id', recipeId); // Store ID for selection
            recipeCard.innerHTML = `
                <h3>${title}</h3>
                <img src="${imageUrl}" alt="${title}" onerror="this.onerror=null; this.src='images/placeholder-recipe.png';">
                <p>Ingredients You Have: ${usedCount}</p>
                <p>Missing Ingredients: ${missingCount}</p>
            `;

            recipeCard.addEventListener('click', function() {
                // Remove 'selected' class from all cards
                document.querySelectorAll('.recipe-card.selected').forEach(card => card.classList.remove('selected'));
                // Add 'selected' class to the clicked card
                recipeCard.classList.add('selected');
                // Call selectRecipe function with ID and Title
                selectRecipe(recipeId, title);
            });

            recipeResultsContainer.appendChild(recipeCard);
        });
    }

    // Function to display missing ingredients with fallback handling (Enhanced version)
    function displayMissingIngredients(ingredients) {
        missingIngredientsContainer.innerHTML = ''; // Clear previous

        if (!ingredients || !Array.isArray(ingredients)) {
            console.warn("displayMissingIngredients called with invalid data");
            missingIngredientsContainer.innerHTML = "<p class='error-message'>Could not display ingredients.</p>";
             return;
        }

        if (ingredients.length === 0) {
            missingIngredientsContainer.innerHTML = '<p class="complete-message">Good news! You seem to have all the ingredients needed for this recipe!</p>';
            return;
        }

        // Use the formatter function
        missingIngredientsContainer.innerHTML = formatShoppingListForDisplay(ingredients);
    }

    // Enhanced error display function with optional blocking
    function showMessage(message, isError, isBlocking = true) {
        errorDisplay.textContent = message;
        errorDisplay.style.display = 'block';

        if (isError) {
            errorDisplay.className = 'message error'; // Use CSS classes
        } else {
            errorDisplay.className = 'message success'; // Use CSS classes
        }

        // For non-blocking messages, set a timeout to hide them
        // For blocking messages, they persist until the user takes another action or navigates away
        if (!isBlocking) {
            setTimeout(() => {
                 // Only hide if it's still the same message (prevent hiding a newer message)
                 if (errorDisplay.textContent === message) {
                     errorDisplay.style.display = 'none';
                     errorDisplay.textContent = '';
                     errorDisplay.className = 'message'; // Reset class
                 }
            }, 5000); // 5 seconds
        }

        return isBlocking; // Return whether this message should block further actions (though not strictly enforced here)
    }

    // ----- Event Listeners -----

    // Toggle delivery options based on selected method
    telegramRadio.addEventListener('change', function() {
        if (this.checked) {
            telegramOptions.style.display = 'block';
            emailOptions.style.display = 'none';
        }
    });

    emailRadio.addEventListener('change', function() {
        if (this.checked) {
            telegramOptions.style.display = 'none';
            emailOptions.style.display = 'block';
        }
    });

    // Back buttons
    backToStep1Btn.addEventListener('click', function() {
        step2.classList.remove('active');
        step1.classList.add('active');
        errorDisplay.style.display = 'none'; // Clear errors on navigation
    });

    backToStep2Btn.addEventListener('click', function() {
        step3.classList.remove('active');
        step2.classList.add('active');
        errorDisplay.style.display = 'none'; // Clear errors on navigation
    });

    // Start over button
    startOverBtn.addEventListener('click', function() {
        // Reset the UI
        step1.classList.add('active');
        step2.classList.remove('active');
        step3.classList.remove('active');
        step4.classList.remove('active');

        // Hide loading indicators
        loading1.style.display = 'none';
        loading2.style.display = 'none';
        loading3.style.display = 'none';

        // Enable buttons
        findRecipesBtn.disabled = false;
        sendListBtn.disabled = false;


        // Clear inputs and results
        ingredientsInput.value = '';
        recipeResultsContainer.innerHTML = '';
        missingIngredientsContainer.innerHTML = '';
        document.getElementById('telegramChatId').value = '';
        document.getElementById('emailAddress').value = '';
        confirmationMessage.textContent = ''; // Clear confirmation message
        errorDisplay.style.display = 'none'; // Clear any errors

        // Reset state (Create a fresh history object)
        conversationHistory = {
            query1: '', llmResponse1: '', toolCall1: '', toolResult1: '', selfCheck1: '', reasoningTypes1: [], error1: '', uncertainty1: '', retryCount1: 0,
            query2: '', llmResponse2: '', toolCall2: '', toolResult2: '', selfCheck2: '', reasoningTypes2: [], error2: '', uncertainty2: '', retryCount2: 0,
            query3: '', llmResponse3: '', toolCall3: '', toolResult3: '', selfCheck3: '', reasoningTypes3: [], error3: '', uncertainty3: '', retryCount3: 0,
            finalResult: ''
        };
        selectedRecipe = null;
        missingIngredientsList = [];
    });

    // --- Main Workflow Steps ---

    // Step 1: Find recipes based on ingredients
    findRecipesBtn.addEventListener('click', function() {
        const ingredients = ingredientsInput.value.trim();

        // **Use ingredientsAreValid check**
        if (!ingredientsAreValid(ingredients)) {
            showMessage(ERROR_MESSAGES.INVALID_INGREDIENTS, true); // Blocking error
            return;
        }

        conversationHistory.query1 = `I have ${ingredients}. What can I make?`;

        chrome.storage.sync.get(['spoonacularKey', 'geminiKey'], function(result) { // Also get gemini key for LLM call
            if (!result.spoonacularKey) {
                showMessage('Spoonacular API key missing. ' + ERROR_MESSAGES.NO_API_KEY, true); // Blocking
                return;
            }
             // Gemini key check happens inside simulateLLMResponse

            // Start Step 1 UI
            loading1.style.display = 'block';
            findRecipesBtn.disabled = true;
            errorDisplay.style.display = 'none'; // Clear previous errors
            recipeResultsContainer.innerHTML = ''; // Clear previous results

            simulateLLMResponse(conversationHistory.query1, 1)
                .then(llmResponse => {
                    // LLM response and metadata are stored inside simulateLLMResponse

                    // Check for blocking errors identified by LLM in self-check/error tags
                    if (conversationHistory.error1 && conversationHistory.error1.toLowerCase().includes('invalid ingredients')) {
                        const isBlocking = showMessage(`AI flagged issue: ${conversationHistory.error1}. Please check your input.`, true);
                        if (isBlocking) {
                             // Stop processing if LLM identifies a blocking input error
                             throw new Error("LLM identified invalid ingredients"); // Throw to skip API call
                        }
                    }
                    // If LLM noted uncertainty, it's logged, but we proceed

                    // Tool Call to Spoonacular API
                    conversationHistory.toolCall1 = `Calling Spoonacular API (findByIngredients) with: ${ingredients}`;
                    return fetchRecipesByIngredients(ingredients, result.spoonacularKey);
                })
                .then(recipes => {
                    // Store Tool Result
                    conversationHistory.toolResult1 = JSON.stringify(recipes); // Store API result

                    // Handle case where API returns empty list
                    if (!recipes || recipes.length === 0) {
                         // Show non-blocking info message, displayRecipes handles the specific UI
                        showMessage(ERROR_MESSAGES.NO_RECIPES_FOUND, false, false);
                    }

                    // Display recipes (handles empty list UI)
                    displayRecipes(recipes);

                    // Move to step 2 (only if successful so far)
                    step1.classList.remove('active');
                    step2.classList.add('active');
                })
                .catch(error => {
                    console.error("Error during Step 1:", error);
                    // Store error in history? Maybe not needed if it's a UI/API error vs LLM error.
                    // Determine appropriate user message
                    let userMessage = ERROR_MESSAGES.GENERAL_ERROR;
                     if (error.message.includes('rate limit')) userMessage = ERROR_MESSAGES.API_RATE_LIMIT;
                     else if (error.message.includes('Network') || error instanceof TypeError) userMessage = ERROR_MESSAGES.NETWORK_ERROR;
                     else if (error.message.includes('unauthorized') || error.message.includes('API key')) userMessage = 'Spoonacular API key seems invalid. Please check configuration.';
                     else if (error.message.includes("invalid ingredients")) userMessage = error.message; // Use error from LLM check if thrown
                     else userMessage = `Error finding recipes: ${error.message}`;

                    showMessage(userMessage, true); // Show blocking error
                })
                .finally(() => {
                    // Always clean up UI state for step 1
                    loading1.style.display = 'none';
                    findRecipesBtn.disabled = false;
                });
        });
    });

    // Step 2: Select a recipe (triggered by clicking a recipe card)
    function selectRecipe(recipeId, recipeTitle) {
        if (!recipeId || !recipeTitle) {
            showMessage(ERROR_MESSAGES.INVALID_RECIPE_SELECTION, true); // Blocking
            return;
        }

        selectedRecipe = { id: recipeId, title: recipeTitle };
        console.log("Recipe selected:", selectedRecipe);

        // Build Query2 including context from step 1
        conversationHistory.query2 = `Previous context:\nQuery1: ${conversationHistory.query1}\nLLM Response1: ${conversationHistory.llmResponse1}\nSelf-Check1: ${conversationHistory.selfCheck1}\nErrors1: ${conversationHistory.error1}\nUncertainty1: ${conversationHistory.uncertainty1}\nTool Call1: ${conversationHistory.toolCall1}\nTool Result1: (Recipes found: ${conversationHistory.toolResult1.length > 2 ? conversationHistory.toolResult1.substring(0,100)+'...' : conversationHistory.toolResult1})\n\nCurrent Action: User selected recipe: ${recipeTitle} (ID: ${recipeId}). Determine missing ingredients.`;

        // Start Step 2 UI
        loading2.style.display = 'block';
        errorDisplay.style.display = 'none'; // Clear previous errors
        missingIngredientsContainer.innerHTML = ''; // Clear previous results

        chrome.storage.sync.get(['spoonacularKey', 'geminiKey'], function(result) { // Need both keys
            if (!result.spoonacularKey) {
                showMessage('Spoonacular API key missing. ' + ERROR_MESSAGES.NO_API_KEY, true); // Blocking
                loading2.style.display = 'none'; // Hide spinner on blocking error
                return;
            }

            simulateLLMResponse(conversationHistory.query2, 2)
                .then(llmResponse => {
                    // LLM response stored internally
                     // Check for critical errors from LLM (e.g., invalid recipe ID identified)
                     if (conversationHistory.error2 && conversationHistory.error2.toLowerCase().includes('invalid recipe id')) {
                         throw new Error("LLM identified invalid recipe ID");
                     }

                    // Tool Call to get missing ingredients
                    conversationHistory.toolCall2 = `Calling Spoonacular API (getRecipeInformation) for ID: ${recipeId}`;

                    // Extract original ingredients list from query1 for comparison
                     let userIngredients = [];
                     try {
                         const ingredientsMatch = conversationHistory.query1.match(/I have (.*?)\./);
                         if (ingredientsMatch && ingredientsMatch[1]) {
                             userIngredients = ingredientsMatch[1].split(',').map(item => item.trim()).filter(i => i);
                         }
                     } catch (e) { console.error("Could not parse user ingredients from query1:", e); }

                    return fetchMissingIngredients(recipeId, userIngredients, result.spoonacularKey);
                })
                .then(missingIngredients => {
                    // Store Tool Result (the list of missing ingredients)
                    conversationHistory.toolResult2 = JSON.stringify(missingIngredients);
                    missingIngredientsList = missingIngredients; // Update state variable

                    // Display missing ingredients (handles empty/fallback cases)
                    displayMissingIngredients(missingIngredientsList);

                    // Move to step 3
                    step2.classList.remove('active');
                    step3.classList.add('active');
                })
                .catch(error => {
                     console.error("Error during Step 2:", error);
                     // Determine appropriate user message
                     let userMessage = ERROR_MESSAGES.GENERAL_ERROR;
                     if (error.message.includes('rate limit')) userMessage = ERROR_MESSAGES.API_RATE_LIMIT;
                     else if (error.message.includes('Network') || error instanceof TypeError) userMessage = ERROR_MESSAGES.NETWORK_ERROR;
                      else if (error.message.includes('unauthorized') || error.message.includes('API key')) userMessage = 'Spoonacular API key seems invalid. Please check configuration.';
                      else if (error.message.includes('not found (404)')) userMessage = `Recipe details not found. It might have been removed. Try another recipe.`;
                      else if (error.message.includes("invalid recipe ID")) userMessage = error.message; // Use error from LLM check
                     else userMessage = `Error getting recipe details: ${error.message}`;

                     showMessage(userMessage, true); // Show blocking error

                     // Optionally, try to show fallback ingredients even on error?
                     // displayMissingIngredients(generateFallbackIngredients(selectedRecipe.title));
                     // If we show fallback, don't necessarily block moving to step 3? Needs thought.
                     // For now, stay on step 2 on error.
                })
                .finally(() => {
                    // Always clean up UI state for step 2
                    loading2.style.display = 'none';
                });
        });
    }

    // Step 3: Send shopping list
    sendListBtn.addEventListener('click', function() {
        const deliveryMethod = telegramRadio.checked ? 'telegram' : 'email';
        let deliveryDetails = '';
        let isValid = true;

        if (deliveryMethod === 'telegram') {
            deliveryDetails = document.getElementById('telegramChatId').value.trim();
            if (!deliveryDetails) {
                 isValid = false; showMessage('Please enter your Telegram Chat ID', true);
            } else if (!/^-?\d+$/.test(deliveryDetails)) { // Validate format
                 isValid = false; showMessage('Telegram Chat ID must be a numeric value', true);
            }
        } else { // email
            deliveryDetails = document.getElementById('emailAddress').value.trim();
            if (!deliveryDetails) {
                 isValid = false; showMessage('Please enter your email address', true);
            } else if (!validateEmail(deliveryDetails)) { // Validate format
                 isValid = false; showMessage('Please enter a valid email address', true);
            }
        }

        if (!isValid) return; // Stop if validation failed

        if (!selectedRecipe) {
             showMessage("Error: No recipe selected. Please go back.", true);
             return;
        }

         // Build Query3 including context from steps 1 & 2
         // Summarize long tool results
         const summarizedResult1 = conversationHistory.toolResult1.length > 200 ? conversationHistory.toolResult1.substring(0, 200) + '...' : conversationHistory.toolResult1;
         const summarizedResult2 = conversationHistory.toolResult2.length > 200 ? conversationHistory.toolResult2.substring(0, 200) + '...' : conversationHistory.toolResult2;

         conversationHistory.query3 = `Previous context:\nQuery1: ${conversationHistory.query1}\nLLM1: ${conversationHistory.llmResponse1.substring(0,100)}...\nTool1: ${summarizedResult1}\nQuery2: User selected ${selectedRecipe.title}\nLLM2: ${conversationHistory.llmResponse2.substring(0,100)}...\nTool2 (Missing Ingredients): ${summarizedResult2}\nSelf-Check2: ${conversationHistory.selfCheck2}\nErrors2: ${conversationHistory.error2}\nUncertainty2: ${conversationHistory.uncertainty2}\n\nCurrent Action: Send the missing ingredients list for ${selectedRecipe.title} via ${deliveryMethod} to ${deliveryDetails}.`;


        // Start Step 3 UI
        loading3.style.display = 'block';
        sendListBtn.disabled = true;
        errorDisplay.style.display = 'none'; // Clear previous errors

        chrome.storage.sync.get(['telegramBotKey', 'sendgridKey', 'geminiKey'], function(result) { // Need sending keys + gemini
            const requiredKey = deliveryMethod === 'telegram' ? 'telegramBotKey' : 'sendgridKey';
            if (!result[requiredKey]) {
                showMessage(`${deliveryMethod === 'telegram' ? 'Telegram Bot' : 'SendGrid'} API key missing. ${ERROR_MESSAGES.NO_API_KEY}`, true); // Blocking
                loading3.style.display = 'none'; // Hide spinner
                sendListBtn.disabled = false;   // Re-enable button
                return;
            }

            simulateLLMResponse(conversationHistory.query3, 3)
                .then(llmResponse => {
                    // LLM response stored internally
                     // Check for critical errors from LLM (e.g., invalid details identified)
                     if (conversationHistory.error3 && conversationHistory.error3.toLowerCase().includes('invalid delivery details')) {
                          throw new Error(`AI flagged issue: ${conversationHistory.error3}`);
                     }

                    // **Assign Tool Call 3 description**
                    conversationHistory.toolCall3 = `Calling ${deliveryMethod === 'telegram' ? 'Telegram API' : 'SendGrid API'} to send list for "${selectedRecipe.title}" to ${deliveryDetails}`;

                    const apiKey = result[requiredKey];
                    // Pass the current missingIngredientsList state
                    return sendShoppingList(deliveryMethod, deliveryDetails, selectedRecipe.title, missingIngredientsList, apiKey);
                })
                .then(sendResult => { // sendResult is the success message string from sendShoppingList
                    // **Assign Tool Result 3**
                    conversationHistory.toolResult3 = sendResult; // Store success message
                    conversationHistory.finalResult = sendResult; // Store final outcome

                    // Display confirmation message
                    confirmationMessage.textContent = sendResult; // Show success message to user

                    // Move to step 4
                    step3.classList.remove('active');
                    step4.classList.add('active');

                    // Save full conversation history to local storage for potential debugging
                    chrome.storage.local.set({ lastConversation: conversationHistory }, () => {
                         if(chrome.runtime.lastError) {
                             console.warn("Could not save conversation history:", chrome.runtime.lastError);
                         } else {
                              console.log("Conversation history saved.");
                         }
                     });
                })
                .catch(error => {
                     console.error("Error during Step 3:", error);
                     // **Assign Tool Result 3 (Error)**
                     conversationHistory.toolResult3 = `Error: ${error.message}`; // Store error message
                     conversationHistory.finalResult = `Failed: ${error.message}`;

                     // Determine appropriate user message
                     let userMessage = ERROR_MESSAGES.GENERAL_ERROR;
                     if (error.message.includes('rate limit')) userMessage = ERROR_MESSAGES.API_RATE_LIMIT;
                     else if (error.message.includes('Network') || error instanceof TypeError) userMessage = ERROR_MESSAGES.NETWORK_ERROR;
                     // Use specific errors thrown by sendShoppingList
                      else if (error.message.includes('Telegram Error:') || error.message.includes('SendGrid Error:')) userMessage = error.message;
                      else if (error.message.includes('unauthorized') || error.message.includes('API key')) userMessage = `${deliveryMethod} API key seems invalid or unauthorized. Check configuration.`;
                      else if (error.message.includes('Invalid delivery details')) userMessage = error.message; // Use LLM error if thrown
                     else userMessage = `Error sending list: ${error.message}`;

                     showMessage(userMessage, true); // Show blocking error
                })
                .finally(() => {
                     // Always clean up UI state for step 3
                     loading3.style.display = 'none';
                     sendListBtn.disabled = false;
                });
        });
    });

});

