const ChatConversation = require('../models/ChatConversation');
const geminiService = require('../services/geminiService');
const { extractEntityLinks } = require('../utils/entityLinkParser');

// POST /api/chat/message
const sendMessage = async (req, res) => {
  try {
    const { conversationId, message } = req.body;
    const userId = req.user._id;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ message: 'הודעה ריקה' });
    }
    if (message.length > 2000) {
      return res.status(400).json({ message: 'ההודעה ארוכה מדי (מקסימום 2000 תווים)' });
    }

    // Get or create conversation
    let conversation;
    if (conversationId) {
      conversation = await ChatConversation.findOne({ _id: conversationId, userId });
      if (!conversation) {
        return res.status(404).json({ message: 'שיחה לא נמצאה' });
      }
    } else {
      conversation = new ChatConversation({
        userId,
        title: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
        messages: [],
        messageCount: 0
      });
    }

    // Add user message
    conversation.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date()
    });

    // Process with Gemini
    const result = await geminiService.processMessage(conversation, message);

    // Extract entity links from response
    const entityLinks = extractEntityLinks(result.text);

    // Add assistant message
    conversation.messages.push({
      role: 'assistant',
      content: result.text,
      entityLinks,
      toolCalls: result.toolCalls.map(tc => ({
        name: tc.name,
        args: tc.args,
        resultSummary: `${tc.resultItemCount || 0} תוצאות`
      })),
      timestamp: new Date()
    });

    conversation.messageCount = conversation.messages.length;
    conversation.lastMessageAt = new Date();

    // Auto-generate title after first exchange
    const isFirstExchange = conversation.messages.filter(m => m.role === 'user').length === 1;
    if (isFirstExchange) {
      conversation.title = await geminiService.generateTitle(message, result.text);
    }

    // Context window management: summarize if > 30 messages
    if (conversation.messages.length > 30 && !conversation.contextSummary) {
      const oldMessages = conversation.messages.slice(0, -10);
      conversation.contextSummary = await geminiService.summarizeMessages(oldMessages);
      // Keep only last 10 messages
      conversation.messages = conversation.messages.slice(-10);
      conversation.messageCount = conversation.messages.length;
    }

    await conversation.save();

    res.json({
      conversationId: conversation._id,
      title: conversation.title,
      message: {
        role: 'assistant',
        content: result.text,
        entityLinks,
        toolCalls: result.toolCalls.map(tc => tc.name),
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Chat error:', error.message);
    console.error('Chat stack:', error.stack);
    res.status(500).json({ message: 'שגיאה בעיבוד ההודעה. נסה שוב.', error: error.message });
  }
};

// GET /api/chat/conversations
const getConversations = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const userId = req.user._id;
    const limitNum = Math.min(Number(limit), 50);
    const pageNum = Number(page);

    const [conversations, total] = await Promise.all([
      ChatConversation.find({ userId, isArchived: false })
        .select('title messageCount lastMessageAt createdAt')
        .sort({ lastMessageAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      ChatConversation.countDocuments({ userId, isArchived: false })
    ]);

    res.json({
      data: conversations,
      pagination: { page: pageNum, limit: limitNum, total }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/chat/conversations/:id
const getConversation = async (req, res) => {
  try {
    const conversation = await ChatConversation.findOne({
      _id: req.params.id,
      userId: req.user._id
    }).lean();

    if (!conversation) {
      return res.status(404).json({ message: 'שיחה לא נמצאה' });
    }
    res.json(conversation);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// DELETE /api/chat/conversations/:id
const archiveConversation = async (req, res) => {
  try {
    const conversation = await ChatConversation.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { isArchived: true },
      { new: true }
    );
    if (!conversation) {
      return res.status(404).json({ message: 'שיחה לא נמצאה' });
    }
    res.json({ message: 'השיחה הועברה לארכיון' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  sendMessage,
  getConversations,
  getConversation,
  archiveConversation
};
