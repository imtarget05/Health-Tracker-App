import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:best_flutter_ui_templates/fitness_app/notification/Chatbox/providers/chat_provider.dart';
import 'package:best_flutter_ui_templates/fitness_app/notification/Chatbox/utility/animated_dialog.dart';
import 'package:best_flutter_ui_templates/fitness_app/notification/Chatbox/widgets/bottom_chat_field.dart';
import 'package:best_flutter_ui_templates/fitness_app/notification/Chatbox/widgets/chat_messages.dart';
import 'package:provider/provider.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      final chatProvider = context.read<ChatProvider>();

      chatProvider.addListener(() {
        if (chatProvider.inChatMessages.isNotEmpty) {
          _scrollToBottom();
        }
      });
    });
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients &&
          _scrollController.position.maxScrollExtent > 0.0) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<ChatProvider>(
      builder: (context, chatProvider, child) {
        return Scaffold(
          appBar: AppBar(
            title: const Text('Chat with Gemini'),
            actions: [
              if (chatProvider.inChatMessages.isNotEmpty)
                IconButton(
                  icon: const Icon(CupertinoIcons.add),
                  onPressed: () {
                    showMyAnimatedDialog(
                      context: context,
                      title: 'Start New Chat',
                      content: 'Are you sure you want to start a new chat?',
                      actionText: 'Yes',
                      onActionPressed: (value) async {
                        if (value) {
                          await chatProvider.prepareChatRoom(
                              isNewChat: true, chatID: '');
                        }
                      },
                    );
                  },
                )
            ],
          ),
          body: SafeArea(
            child: Column(
              children: [
                Expanded(
                  child: chatProvider.inChatMessages.isEmpty
                      ? const Center(child: Text('No messages yet'))
                      : ChatMessages(
                    scrollController: _scrollController,
                    chatProvider: chatProvider,
                  ),
                ),
                BottomChatField(chatProvider: chatProvider)
              ],
            ),
          ),
        );
      },
    );
  }
}
