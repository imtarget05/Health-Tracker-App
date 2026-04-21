class PendingSignup {
  // temporarily store signup info between Register -> Onboarding -> Habit
  // ✅ SECURITY: Do NOT store password - it's only used once during signup
  static Map<String, String?>? data;

  static void set({required String email, required String fullName, String? phone, String? password}) {
    // ✅ SECURITY: Never store password in local storage
    // Password is only needed for the initial registration request
    // Do NOT include password in this map
    data = {
      'email': email,
      'fullName': fullName,
      'phone': phone,
      // PASSWORD IS NOT STORED - never store passwords locally!
    };
  }

  static Map<String, String?>? consume() {
    final d = data;
    data = null;
    return d;
  }

  // Peek at pending signup without consuming it.
  static Map<String, String?>? peek() {
    return data;
  }
}
