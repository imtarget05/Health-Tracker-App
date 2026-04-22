// Suppress private-type-in-public-api info for this UI file.
// The widgets intentionally use private State classes; silencing
// the analyzer here reduces noise while preserving behavior.
// Also ignore use_build_context_synchronously for this UI file —
// the notification UI uses context after network calls but guards
// with mounted checks; keeping this ignore avoids noisy lints.
// ignore_for_file: library_private_types_in_public_api, use_build_context_synchronously

import 'package:best_flutter_ui_templates/fitness_app/ui_view/title_view.dart';
import 'package:flutter/material.dart';

import '../fitness_app_theme.dart';

import 'package:best_flutter_ui_templates/fitness_app/notification/Chatbox/providers/chat_provider.dart';
import 'package:best_flutter_ui_templates/fitness_app/notification/Chatbox/providers/settings_provider.dart';
import 'package:best_flutter_ui_templates/fitness_app/notification/Chatbox/screens/home_screen.dart';
import 'dart:async';
import 'dart:convert';
import 'package:best_flutter_ui_templates/services/notification_service.dart';
import 'package:best_flutter_ui_templates/services/auth_storage.dart';
import 'package:http/http.dart' as http;
import 'package:best_flutter_ui_templates/services/backend_api.dart';
import 'package:best_flutter_ui_templates/services/event_bus.dart';
import 'package:provider/provider.dart';

// Dialog that lists common notification types for emit testing
class _EmitDialog extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final options = <Map<String, dynamic>>[
      {'label': 'Đăng ký (Signup)', 'type': 'AUTH_SIGNUP', 'data': {}},
      {'label': 'Đăng nhập (Login)', 'type': 'AUTH_LOGIN', 'data': {}},
      {'label': 'Đăng xuất (Logout)', 'type': 'AUTH_LOGOUT', 'data': {}},
      {'label': 'Chào mừng bạn quay trở lại (Re-engage)', 'type': 'RE_ENGAGEMENT', 'data': {'inactive_days': 7}},
      {'label': 'Chat AI (interaction)', 'type': 'AI_PROCESSING_SUCCESS', 'data': {'meal_type': 'Lunch', 'food_name': 'Gỏi cuốn', 'calories': 320}},
      {'label': 'Gửi ảnh cho AI phân tích (AI processing)', 'type': 'AI_PROCESSING_SUCCESS', 'data': {'meal_type': 'Dinner', 'food_name': 'Phở', 'calories': 450}},
      {'label': 'AI phân tích thất bại', 'type': 'AI_PROCESSING_FAILURE', 'data': {}},
      {'label': 'Tổng kết hôm nay (Daily summary)', 'type': 'DAILY_SUMMARY', 'data': {'total_calories': 1500, 'target_calories': 2000, 'total_water': 1200, 'target_water': 2000, 'summary_note': 'Nice job!'}},
    ];

    return AlertDialog(
      title: const Text('Emit notification'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: options.map((o) => ListTile(
            title: Text(o['label'] as String),
            onTap: () => Navigator.of(context).pop(jsonEncode({'type': o['type'], 'data': o['data']})),
          )).toList(),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
      ],
    );
  }
}

class NotificationScreen extends StatefulWidget {
  const NotificationScreen({super.key, this.animationController});

  final AnimationController? animationController;
  @override
  _NotificationScreenState createState() => _NotificationScreenState();
}

class _NotificationScreenState extends State<NotificationScreen>
    with TickerProviderStateMixin {
  Animation<double>? topBarAnimation;

  List<Widget> listViews = <Widget>[];
  List<Map<String, dynamic>> notifications = [];
  final ScrollController scrollController = ScrollController();
  double topBarOpacity = 0.0;
  // Track recently-inserted notification ids for brief highlight animations
  final Map<String, DateTime> _recentHighlights = {};
  StreamSubscription? _eventSub;

  @override
  void initState() {
    topBarAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: widget.animationController!,
        curve: Interval(0, 0.5, curve: Curves.fastOutSlowIn),
      ),
    );
    addAllListData();
    _loadNotifications();

    // Listen for app-level new-notification events so pushes can insert instantly
    try {
      _eventSub = EventBus.instance.stream.listen((evt) {
        if (evt.message == 'new-notification' && evt.payload is Map<String, dynamic>) {
          final n = Map<String, dynamic>.from(evt.payload as Map<String, dynamic>);
          // ensure we have an id for highlight tracking
          final id = n['id']?.toString() ?? 'local-${DateTime.now().microsecondsSinceEpoch}';
          n['id'] = n['id'] ?? id;
          insertNotification(n);
          // mark for highlight
          _recentHighlights[id] = DateTime.now();
          // schedule cleanup after 3s
          Future.delayed(const Duration(seconds: 3), () {
            _recentHighlights.remove(id);
            if (mounted) setState(() {});
          });
        }
      });
    } catch (_) {}

    scrollController.addListener(() {
      if (scrollController.offset >= 24) {
        if (topBarOpacity != 1.0) {
          setState(() {
            topBarOpacity = 1.0;
          });
        }
      } else if (scrollController.offset <= 24 && scrollController.offset >= 0) {
        if (topBarOpacity != scrollController.offset / 24) {
          setState(() {
            topBarOpacity = scrollController.offset / 24;
          });
        }
      } else if (scrollController.offset <= 0) {
        if (topBarOpacity != 0.0) {
          setState(() {
            topBarOpacity = 0.0;
          });
        }
      }
    });
    super.initState();
  }

  @override
  void dispose() {
    _eventSub?.cancel();
    super.dispose();
  }

  Future<void> _loadNotifications() async {
    try {
      final fetched = await NotificationService.fetchNotifications();
      if (!mounted) return;
      setState(() {
        notifications = fetched.map((n) => Map<String, dynamic>.from(n)).toList();
        for (var n in notifications) {
          n.putIfAbsent('isRead', () => false);
          // Ensure we have a parsed timestamp for UI. Prefer sentAt -> createdAt -> now
          DateTime? parsed;
          try {
            if (n['sentAt'] != null && n['sentAt'] is String) parsed = DateTime.parse(n['sentAt']);
          } catch (_) {}
          if (parsed == null) {
            try {
              if (n['createdAt'] != null && n['createdAt'] is String) parsed = DateTime.parse(n['createdAt']);
            } catch (_) {}
          }
          // If still null, fallback to current time so new/just-received notifications
          // render with the current timestamp in the list (matches user expectation).
          parsed ??= DateTime.now();
          n['createdAtParsed'] = parsed;
        }
        addAllListData();
      });
    } catch (e) {
      if (!mounted) return;
      final messenger = ScaffoldMessenger.of(context);
      messenger.showSnackBar(
        const SnackBar(content: Text('Failed to load notifications')),
      );
    }
  }

  void addAllListData() {
    // Simplified: show notifications in chronological order only.
    listViews.clear();
    if (notifications.isEmpty) return;

    // Sort by createdAtParsed (desc) when available, otherwise leave order
    notifications.sort((a, b) {
      final da = a['createdAtParsed'] as DateTime?;
      final db = b['createdAtParsed'] as DateTime?;
      if (da == null && db == null) return 0;
      if (da == null) return 1;
      if (db == null) return -1;
      return db.compareTo(da);
    });

    for (var n in notifications) {
      listViews.add(_notificationTile(n));
    }
  }

  Widget _emptyMessage(String txt) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
      child: Text(
        txt,
        style: const TextStyle(color: Colors.grey, fontSize: 16),
      ),
    );
  }

  Widget _notificationTile(Map<String, dynamic> n) {
    final title = n['title']?.toString() ?? n['message']?.toString() ?? 'Notification';
    final body = n['body']?.toString() ?? n['message']?.toString() ?? '';
    // Prefer parsed timestamp then sentAt/createAt; format as relative label (Now/1m/2h)
    DateTime? dt = n['createdAtParsed'] as DateTime?;
    if (dt == null) {
      try {
        if (n['sentAt'] != null && n['sentAt'] is String) dt = DateTime.parse(n['sentAt']);
      } catch (_) {}
      if (dt == null && n['createdAt'] != null) {
        try {
          dt = DateTime.parse(n['createdAt'].toString());
        } catch (_) {}
      }
    }
    final subtitle = dt != null ? _formatRelativeTime(dt) : null;
    final isRead = n['isRead'] == true;
    final id = n['id']?.toString() ?? '';
    final highlight = _recentHighlights.containsKey(id);
    return Container(
      color: highlight ? Colors.yellow.withOpacity(0.12) : Colors.transparent,
      child: ListTile(
      title: Row(
        children: [
          if (!isRead)
            Container(
              width: 8,
              height: 8,
              margin: const EdgeInsets.only(right: 8),
              decoration: const BoxDecoration(color: Colors.blue, shape: BoxShape.circle),
            ),
          Expanded(child: Text(title, style: const TextStyle(fontWeight: FontWeight.w600))),
        ],
      ),
      subtitle: subtitle != null ? Text('$subtitle · $body') : Text(body),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 4.0),
      onTap: () async {
        setState(() => n['isRead'] = true);
        // if we have a backend id, persist change
        if (n['id'] != null) {
          try {
            final token = AuthStorage.token;
            final uri = Uri.parse('${BackendApi.baseUrl}/notifications/${n['id']}/read');
            final headers = {'Accept': 'application/json'};
            if (token != null && token.isNotEmpty) headers['Authorization'] = 'Bearer $token';
            await http.patch(uri, headers: headers);
          } catch (_) {
            // ignore network errors for now
          }
        }
      },
      trailing: IconButton(
        icon: Icon(isRead ? Icons.mark_email_read : Icons.mark_email_unread),
        onPressed: () async {
          setState(() {
            n['isRead'] = !isRead;
          });
          if (n['id'] != null) {
            try {
              final token = AuthStorage.token;
              final uri = Uri.parse('${BackendApi.baseUrl}/notifications/${n['id']}/read');
              final headers = {'Accept': 'application/json', 'Content-Type': 'application/json'};
              if (token != null && token.isNotEmpty) headers['Authorization'] = 'Bearer $token';
              await http.patch(uri, headers: headers, body: jsonEncode({'read': n['isRead']}));
            } catch (_) {
              // ignore
            }
          }
        },
      ),
      ),
    );
  }

  // Insert a notification (e.g. when received via push). This ensures
  // we set a parsed timestamp (now) so the UI shows an immediate time label.
  void insertNotification(Map<String, dynamic> n) {
    setState(() {
      n.putIfAbsent('isRead', () => false);
      DateTime? parsed = n['createdAtParsed'] as DateTime?;
      if (parsed == null) {
        try {
          if (n['sentAt'] != null && n['sentAt'] is String) parsed = DateTime.parse(n['sentAt']);
        } catch (_) {}
      }
      parsed ??= DateTime.now();
      n['createdAtParsed'] = parsed;
      // Insert at top
      notifications.insert(0, n);
      addAllListData();
    });
  }

  String _formatRelativeTime(DateTime dt) {
    final now = DateTime.now();
    Duration diff = now.difference(dt);
    if (diff.isNegative) diff = Duration.zero;
    if (diff.inSeconds < 60) return 'Now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m';
    if (diff.inHours < 24) return '${diff.inHours}h';
    if (diff.inDays < 7) return '${diff.inDays}d';
    // older: show date
    return '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')}/${dt.year}';
  }

  Future<bool> getData() async {
    await Future<dynamic>.delayed(const Duration(milliseconds: 50));
    return true;
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      color: FitnessAppTheme.background,
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: Stack(
          children: <Widget>[
            getMainListViewUI(),
            getAppBarUI(),
            // dev token UI overlay is injected inside the app bar area via getAppBarUI
            SizedBox(
              height: MediaQuery.of(context).padding.bottom,
            )
          ],
        ),
      ),
    );
  }

  Widget getMainListViewUI() {
    return FutureBuilder<bool>(
      future: getData(),
      builder: (BuildContext context, AsyncSnapshot<bool> snapshot) {
        if (!snapshot.hasData) {
          return const SizedBox();
        } else {
          return RefreshIndicator(
            onRefresh: _loadNotifications,
            child: ListView.builder(
              controller: scrollController,
              padding: EdgeInsets.only(
                top: AppBar().preferredSize.height +
                    MediaQuery.of(context).padding.top +
                    24,
                bottom: 62 + MediaQuery.of(context).padding.bottom,
              ),
              itemCount: listViews.length,
              scrollDirection: Axis.vertical,
              itemBuilder: (BuildContext context, int index) {
                widget.animationController?.forward();
                return listViews[index];
              },
            ),
          );
        }
      },
    );
  }

  Widget getAppBarUI() {
    return Column(
      children: <Widget>[
        AnimatedBuilder(
          animation: widget.animationController!,
          builder: (BuildContext context, Widget? child) {
            return FadeTransition(
              opacity: topBarAnimation!,
              child: Transform(
                transform: Matrix4.translationValues(
                    0.0, 30 * (1.0 - topBarAnimation!.value), 0.0),
                child: Container(
                  decoration: BoxDecoration(
                    color: FitnessAppTheme.white.withAlpha((topBarOpacity * 255).round()),
                    borderRadius: const BorderRadius.only(
                      bottomLeft: Radius.circular(32.0),
                    ),
                    boxShadow: <BoxShadow>[
                      BoxShadow(
                          color: FitnessAppTheme.grey
                              .withAlpha(((0.4 * topBarOpacity) * 255).round()),
                          offset: const Offset(1.1, 1.1),
                          blurRadius: 10.0),
                    ],
                  ),
                  child: Column(
                    children: <Widget>[
                      SizedBox(
                        height: MediaQuery.of(context).padding.top,
                      ),
                      Padding(
                        padding: EdgeInsets.only(
                            left: 16,
                            right: 16,
                            top: 16 - 8.0 * topBarOpacity,
                            bottom: 12 - 8.0 * topBarOpacity),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: <Widget>[
                            Expanded(
                              child: Padding(
                                padding: const EdgeInsets.all(8.0),
                                child: Text(
                                  'Notification',
                                  textAlign: TextAlign.left,
                                  style: TextStyle(
                                    fontFamily: FitnessAppTheme.fontName,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 22 + 6 - 6 * topBarOpacity,
                                    letterSpacing: 1.2,
                                    color: FitnessAppTheme.darkerText,
                                  ),
                                ),
                              ),
                            ),

                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                IconButton(
                                  icon: const Icon(Icons.wechat),
                                  iconSize: 50,
                                  color: FitnessAppTheme.darkText,
                                  onPressed: () {
                                    Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                        builder: (context) => MultiProvider(
                                          providers: [
                                            ChangeNotifierProvider(create: (_) => SettingsProvider()),
                                            ChangeNotifierProvider(create: (_) => ChatProvider()),
                                          ],
                                          child: const HomeScreen(),
                                        ),
                                      ),
                                    );
                                  },
                                ),
                                IconButton(
                                  icon: const Icon(Icons.campaign),
                                  iconSize: 26,
                                  color: FitnessAppTheme.darkText,
                                  tooltip: 'Emit test notification',
                                  onPressed: () async {
                                    // Open emit dialog to choose notification type
                                    final pickedJson = await showDialog<String>(
                                      context: context,
                                      builder: (ctx) => _EmitDialog(),
                                    );
                                    if (pickedJson == null) return;
                                    final pickedMap = jsonDecode(pickedJson) as Map<String, dynamic>;
                                    final picked = pickedMap['type'] as String;
                                    final pickedData = pickedMap['data'] as Map<String, dynamic>;
                                    try {
                                      final token = AuthStorage.token;
                                      final uri = Uri.parse('${BackendApi.baseUrl}/notifications/test');
                                      final headers = <String, String>{'Content-Type': 'application/json'};
                                      if (token != null && token.isNotEmpty) headers['Authorization'] = 'Bearer $token';
                                      final body = jsonEncode({'type': picked, 'data': pickedData});
                                      final resp = await http.post(uri, headers: headers, body: body).timeout(const Duration(seconds: 5));
                                      if (!mounted) return;
                                      if (resp.statusCode == 200 || resp.statusCode == 201) {
                                        // Show top floating banner similar to screenshot
                                        _showTopEmitBanner(context, 'Emitted test notification');
                                        await _loadNotifications();
                                      } else {
                                        _showTopEmitBanner(context, 'Emit failed: ${resp.statusCode}', isError: true);
                                      }
                                    } catch (e) {
                                      if (!mounted) return;
                                      _showTopEmitBanner(context, 'Emit error', isError: true);
                                    }
                                  },
                                ),
                              ],
                            ),

                          ],
                        ),
                      ),
                      // (dev token panel removed)
                    ],
                  ),
                ),
              ),
            );
          },
        )
      ],
    );
  }

                  // Floating top banner to show emit result (matches screenshot style)
                  void _showTopEmitBanner(BuildContext ctx, String message, {bool isError = false}) {
                    final overlay = Overlay.of(ctx);
                    if (overlay == null) return;
                    late OverlayEntry overlayEntry;
                    overlayEntry = OverlayEntry(builder: (context) {
                      return Positioned(
                        top: MediaQuery.of(ctx).padding.top + 8,
                        left: 16,
                        right: 16,
                        child: Material(
                          color: Colors.transparent,
                          child: Container(
                            decoration: BoxDecoration(
                              color: isError ? Colors.red.shade700.withOpacity(0.9) : Colors.black87,
                              borderRadius: BorderRadius.circular(12),
                              boxShadow: [BoxShadow(color: Colors.black26, blurRadius: 8)],
                            ),
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Row(
                                  children: [
                                    const Icon(Icons.info_outline, color: Colors.white70),
                                    const SizedBox(width: 8),
                                    Expanded(child: Text(message, style: const TextStyle(color: Colors.white))),
                                    GestureDetector(
                                      onTap: () => overlayEntry.remove(),
                                      child: const Icon(Icons.close, color: Colors.white70),
                                    )
                                  ],
                                ),
                                const SizedBox(height: 8),
                                // Thin progress bar to mimic screenshot
                                LinearProgressIndicator(
                                  value: null,
                                  backgroundColor: Colors.white24,
                                  valueColor: AlwaysStoppedAnimation<Color>(isError ? Colors.orangeAccent : Colors.greenAccent),
                                ),
                              ],
                            ),
                          ),
                        ),
                      );
                    });

                    overlay.insert(overlayEntry);
                    // auto remove after 3 seconds
                    Future.delayed(const Duration(seconds: 3), () { if (overlayEntry.mounted) overlayEntry.remove(); });
                  }

// (emit dialog defined at top-level)

// Small dev-only widget to paste a backend JWT and save it to AuthStorage
// Dev token panel removed from production build

}
