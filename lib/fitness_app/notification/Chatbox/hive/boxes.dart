import 'package:best_flutter_ui_templates/fitness_app/notification/Chatbox/constants/constants.dart';
import 'package:best_flutter_ui_templates/fitness_app/notification/Chatbox/hive/chat_history.dart';
import 'package:best_flutter_ui_templates/fitness_app/notification/Chatbox/hive/settings.dart';
import 'package:best_flutter_ui_templates/fitness_app/notification/Chatbox/hive/user_model.dart';
import 'package:hive/hive.dart';

class Boxes {
  // get the chat history box
  static Box<ChatHistory> getChatHistory() =>
      Hive.box<ChatHistory>(Constants.chatHistoryBox);

  // get user box
  static Box<UserModel> getUser() => Hive.box<UserModel>(Constants.userBox);

  // get settings box
  static Box<Settings> getSettings() =>
      Hive.box<Settings>(Constants.settingsBox);
}
