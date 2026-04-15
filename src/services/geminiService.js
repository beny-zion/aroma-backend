const { GoogleGenAI } = require('@google/genai');
const toolDefinitions = require('./chatToolDefinitions');
const toolExecutors = require('./chatToolExecutors');

class GeminiService {
  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    this.model = 'gemini-2.5-flash';
    this.maxIterations = 3;
  }

  getSystemPrompt() {
    return `אתה עוזר AI של מערכת ארומה פלוס - מערכת ניהול מכשירי ריח מקצועית.

⚠️ כלל עליון - אסור להמציא מידע! ⚠️
אתה חייב להציג אך ורק נתונים שחזרו מהכלים (function calls). אם כלי החזיר 3 לקוחות - יש בדיוק 3 לקוחות. אסור להוסיף, להמציא, או "לדמיין" ישויות שלא קיימות בתוצאות. אם לא קיבלת מידע מכלי - אמור "לא מצאתי מידע על זה במערכת". לעולם אל תנחש שמות של לקוחות, סניפים, מכשירים או כל ישות אחרת.

כללים:
1. תמיד תענה בעברית.
2. אתה עוזר לקריאה בלבד - אתה יכול לחפש ולהציג מידע, אבל לא לשנות שום דבר במערכת.
3. כשאתה מזכיר ישויות (לקוחות, סניפים, מכשירים, הזמנות עבודה), חובה להשתמש בפורמט הבא: [[סוג:מזהה:שם תצוגה]]
   דוגמאות:
   - [[customer:507f1f77bcf86cd799439011:רשת קפה ארומה]]
   - [[branch:507f1f77bcf86cd799439012:סניף דיזנגוף]]
   - [[device:507f1f77bcf86cd799439013:מכשיר גדול - לובי]]
4. סוגי הישויות: customer, branch, device, work-order, scent
5. סטטוס מילוי מכשירים:
   - ירוק (green) = תקין, עד 30 יום מהמילוי האחרון
   - צהוב (yellow) = דורש מילוי בקרוב, 30-45 יום
   - אדום (red) = דחוף! מעל 45 יום או לא ידוע
6. **חובה מוחלטת: תמיד חפש לפני שאתה עונה!** כשמשתמש שואל על לקוח, סניף, מכשיר או כל ישות - אתה חייב קודם כל להפעיל את כלי החיפוש המתאים (search_customers, search_branches, וכו'). גם אם השם נשמע לא מוכר - חפש! אסור לענות "לא מצאתי" בלי שהפעלת כלי חיפוש קודם.
7. **הצג רק מה שקיבלת מהכלים.** אם הכלי החזיר רשימה של 5 פריטים - יש 5 פריטים בלבד. לא 6, לא 10. הצג בדיוק את מה שחזר, בלי תוספות.
8. רק אחרי שהפעלת כלי חיפוש ולא קיבלת תוצאות - אז ורק אז אמור "לא מצאתי מידע על זה במערכת".
9. פרמט תשובות בצורה נקייה עם bullet points ומספרים כשמתאים.
10. כשנשאל על "מצב" של סניף/לקוח - תן סקירה מקיפה: כמה מכשירים, סטטוס מילוי, פעילות אחרונה.
11. הגבל תשובות ל-500 מילים. היה תמציתי אבל מקיף.
12. כשיש מכשירים באדום, הדגש את זה כדחוף.
13. תמיד ציין מספרים ונתונים מדויקים - רק מתוצאות הכלים.
14. **חיפוש חכם:** הכלים כבר מנסים וריאציות חיפוש אוטומטית. אם קיבלת רשימה כתשובה - הצג אותה ושאל "האם התכוונת לאחד מאלה?" אל תמציא שמות נוספים מעבר למה שהכלי החזיר.
15. כשמציג רשימות, תמיד הוסף את הלינק [[type:id:name]] לכל ישות כדי שהמשתמש יוכל ללחוץ ולנווט.`;
  }

  // Build Gemini contents array from conversation history
  buildContents(conversation, newMessage) {
    const contents = [];

    // Add context summary if exists (for long conversations)
    if (conversation.contextSummary) {
      contents.push({
        role: 'user',
        parts: [{ text: `[סיכום שיחה קודמת: ${conversation.contextSummary}]` }]
      });
      contents.push({
        role: 'model',
        parts: [{ text: 'הבנתי את ההקשר. אמשיך מכאן.' }]
      });
    }

    // Add recent messages (last 20 if no summary, last 10 if has summary)
    const maxMessages = conversation.contextSummary ? 10 : 20;
    const recentMessages = conversation.messages.slice(-maxMessages);

    for (const msg of recentMessages) {
      contents.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      });
    }

    // Add new user message
    contents.push({
      role: 'user',
      parts: [{ text: newMessage }]
    });

    return contents;
  }

  // Main method: process a user message through Gemini with function calling
  async processMessage(conversation, userMessage) {
    const contents = this.buildContents(conversation, userMessage);
    const allToolCalls = [];

    let iterationCount = 0;

    while (iterationCount < this.maxIterations) {
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents,
        config: {
          tools: [{ functionDeclarations: toolDefinitions }],
          systemInstruction: this.getSystemPrompt(),
          temperature: 0.3,
          maxOutputTokens: 2048
        }
      });

      const candidate = response.candidates?.[0];
      if (!candidate) {
        return { text: 'לא הצלחתי לעבד את הבקשה. נסה שוב.', toolCalls: allToolCalls };
      }

      // Check for function calls
      const functionCalls = response.functionCalls;
      console.log(`[Gemini] Iteration ${iterationCount}: functionCalls=${functionCalls?.length || 0}, hasText=${!!candidate.content?.parts?.[0]?.text}`);

      if (functionCalls && functionCalls.length > 0) {
        console.log(`[Gemini] Tool calls requested:`, functionCalls.map(fc => `${fc.name}(${JSON.stringify(fc.args)})`).join(', '));
        // Add model's response to contents
        contents.push(candidate.content);

        // Execute all function calls in parallel
        const functionResponses = await Promise.all(
          functionCalls.map(async (fc) => {
            const executor = toolExecutors[fc.name];
            if (!executor) {
              return {
                name: fc.name,
                response: { output: { error: `כלי לא מוכר: ${fc.name}` } }
              };
            }

            try {
              const result = await executor(fc.args || {});
              const itemCount = this._countItems(result);
              allToolCalls.push({
                name: fc.name,
                args: fc.args,
                resultItemCount: itemCount
              });
              // Anti-hallucination: explicitly tell Gemini these are ALL results from the database
              result._dataIntegrity = `IMPORTANT: This response contains exactly ${itemCount} items from the database. These are the ONLY items that exist. Do NOT add, invent, or guess any additional items beyond what is listed here.`;
              return {
                name: fc.name,
                response: { output: result }
              };
            } catch (err) {
              return {
                name: fc.name,
                response: { output: { error: err.message } }
              };
            }
          })
        );

        // Add function responses to contents
        contents.push({
          role: 'user',
          parts: functionResponses.map(fr => ({
            functionResponse: fr
          }))
        });

        iterationCount++;
        continue;
      }

      // No function calls - return text response
      const text = candidate.content?.parts?.[0]?.text || 'לא הצלחתי לייצר תשובה.';
      return { text, toolCalls: allToolCalls };
    }

    // Max iterations reached - one final call without tools to force text
    contents.push({
      role: 'user',
      parts: [{ text: 'בבקשה סכם את המידע שאספת ותן תשובה סופית בעברית.' }]
    });

    const finalResponse = await this.ai.models.generateContent({
      model: this.model,
      contents,
      config: {
        systemInstruction: this.getSystemPrompt(),
        temperature: 0.3,
        maxOutputTokens: 2048
      }
    });

    const finalText = finalResponse.candidates?.[0]?.content?.parts?.[0]?.text || 'לא הצלחתי לייצר תשובה.';
    return { text: finalText, toolCalls: allToolCalls };
  }

  // Generate a short title for the conversation
  async generateTitle(userMessage, assistantResponse) {
    try {
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: [{
          role: 'user',
          parts: [{ text: `צור כותרת קצרה בעברית (מקסימום 6 מילים) לשיחה הבאה. תחזיר רק את הכותרת, בלי גרשיים.
שאלה: "${userMessage}"
תשובה (תחילת): "${assistantResponse.substring(0, 200)}"` }]
        }],
        config: { temperature: 0.3, maxOutputTokens: 30 }
      });
      const title = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim().replace(/"/g, '');
      return title?.substring(0, 100) || 'שיחה חדשה';
    } catch {
      return userMessage.substring(0, 50) + (userMessage.length > 50 ? '...' : '');
    }
  }

  // Summarize old messages for context window management
  async summarizeMessages(messages) {
    try {
      const messageText = messages.map(m => `${m.role === 'user' ? 'משתמש' : 'עוזר'}: ${m.content}`).join('\n');
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: [{
          role: 'user',
          parts: [{ text: `סכם את השיחה הבאה בעברית, תמקד בישויות שנדונו (לקוחות, סניפים, מכשירים) ובמידע שנמצא. מקסימום 300 מילים.\n\n${messageText}` }]
        }],
        config: { temperature: 0.1, maxOutputTokens: 1024 }
      });
      return response.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch {
      return '';
    }
  }

  // Count items in result for tool call summary
  _countItems(result) {
    if (!result) return 0;
    for (const key of Object.keys(result)) {
      if (Array.isArray(result[key])) return result[key].length;
    }
    return 1;
  }
}

module.exports = new GeminiService();
