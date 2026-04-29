import 'dart:convert';
import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import '../firebase_options.dart';
import 'package:best_flutter_ui_templates/services/event_bus.dart';
import 'pending_signup.dart';

class ProfileSyncService {
  ProfileSyncService._privateConstructor();
  static final ProfileSyncService instance = ProfileSyncService._privateConstructor();

  static const _boxName = 'profile_sync_queue';
  Box<dynamic>? _box;
  bool _initialized = false;
  bool _flushing = false;
  StreamSubscription<User?>? _authSub;
  // Notify UI about queue length
  final queueCount = ValueNotifier<int>(0);

  Future<void> init() async {
    if (_initialized) return;
    // init Hive
    await Hive.initFlutter();
    _box = await Hive.openBox(_boxName);
    // init firebase if needed
    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
      }
    } catch (_) {}
    _initialized = true;
  _updateQueueCount();
    debugPrint('ProfileSync: initialized, queue=${_box?.length ?? 0}');
    // try to flush any pending items
    // If user already signed in, flush now
    if (FirebaseAuth.instance.currentUser != null) {
      unawaited(_flushQueue());
    }

    // Listen for auth state changes: when a user signs in, try flushing queued items
    _authSub ??= FirebaseAuth.instance.authStateChanges().listen((user) {
      if (user != null) {
        debugPrint('ProfileSync: user signed in, attempting flush');
        unawaited(_flushQueue());
      }
    });
  }

  Future<void> saveProfilePartial(Map<String, dynamic> data) async {
    await init();
    // attach timestamp
    final item = {
      'data': data,
      'createdAt': DateTime.now().toIso8601String(),
    };

    // Try immediate write if user signed in
    final user = FirebaseAuth.instance.currentUser;
    var immediateFailedDueToPermissionDenied = false;
    if (user != null) {
      try {
        final db = FirebaseFirestore.instance;
        final doc = db.collection('users').doc(user.uid);
        debugPrint('ProfileSync: immediate save for ${user.uid}, data: $data');
        await doc.set(data, SetOptions(merge: true));
        debugPrint('ProfileSync: immediate save successful for ${user.uid}');
  // Notify app that profile changed from immediate save
  try { EventBus.instance.emitProfileUpdated({'updated': data.keys.toList()}); } catch (_) {}
        return;
      } catch (e) {
        debugPrint('ProfileSync: immediate save failed for ${user.uid}: $e');
        // If the failure is permission-denied, avoid immediately retrying flush
        if (e is FirebaseException && e.code == 'permission-denied') {
          immediateFailedDueToPermissionDenied = true;
        }
        // fall through to enqueue
      }
    }

    // enqueue for later
    if (_box == null) {
      debugPrint('ProfileSync: box is null when enqueuing; initializing and retrying');
      await init();
    }
  await _box!.add(jsonEncode(item));
  _updateQueueCount();
  debugPrint('ProfileSync: enqueued item, queue=${_box?.length ?? 0}');
    // attempt flush in background only if a user is currently signed in and
    // the immediate failure wasn't due to permission-denied. If no user is
    // signed in we'll keep the item enqueued and flush when user signs in.
    final currentUser = FirebaseAuth.instance.currentUser;
    if (!immediateFailedDueToPermissionDenied && currentUser != null) {
      // Kick off a background flush but avoid verbose per-item logging here.
      unawaited(_flushQueue());
    } else if (currentUser == null) {
      // Keep message concise to avoid spam when many items are enqueued while
      // the user is signed out.
      debugPrint('ProfileSync: enqueued item, will flush after sign-in (queue=${_box?.length ?? 0})');
    } else {
      debugPrint('ProfileSync: skipping immediate flush due to permission-denied');
    }
  }

  /// Return queued items as decoded list
  List<Map<String, dynamic>> readQueue() {
    if (!_initialized || _box == null) return [];
    return _box!.values.map((e) {
      try {
        return Map<String, dynamic>.from(jsonDecode(e as String));
      } catch (_) {
        return <String, dynamic>{};
      }
    }).toList();
  }

  Future<void> clearQueue() async {
    if (!_initialized || _box == null) return;
    await _box!.clear();
  _updateQueueCount();
  }

  /// Public retry trigger
  Future<void> retryQueue() async => _flushQueue();

  Future<void> _flushQueue() async {
  if (_flushing) return;
  _flushing = true;
  debugPrint('ProfileSync: starting flush (queue=${_box?.length ?? 0})');
    try {
      if (!_initialized) await init();
      final box = _box!;
      int attempt = 0;
      while (box.isNotEmpty) {
        final raw = box.getAt(0) as String;
        final Map<String, dynamic> item = jsonDecode(raw) as Map<String, dynamic>;
        final data = Map<String, dynamic>.from(item['data'] ?? {});

  User? user = FirebaseAuth.instance.currentUser;
        if (user == null) {
          // If there's a pending signup saved (user previously tried to
          // register but network/auth failed), attempt to create/sign-in the
          // Firebase Auth user now that network may be available.
          try {
            final pending = PendingSignup.peek();
            if (pending != null) {
              final email = pending['email'];
              final password = pending['password'];
              if (email != null && password != null) {
                debugPrint('ProfileSync: attempting to create/sign-in user from PendingSignup for $email');
                try {
                  await FirebaseAuth.instance.createUserWithEmailAndPassword(email: email, password: password);
                  debugPrint('ProfileSync: createUserWithEmailAndPassword succeeded for $email');
                  // consume pending so duplicate retries aren't attempted
                  PendingSignup.consume();
                  // refresh current user
                  user = FirebaseAuth.instance.currentUser;
                } on FirebaseAuthException catch (e) {
                  debugPrint('ProfileSync: createUser failed for $email: ${e.code}');
                  if (e.code == 'email-already-in-use' || e.code == 'email-already-exists') {
                    try {
                      await FirebaseAuth.instance.signInWithEmailAndPassword(email: email, password: password);
                      debugPrint('ProfileSync: signed in existing user $email');
                      PendingSignup.consume();
                      user = FirebaseAuth.instance.currentUser;
                    } catch (e2) {
                      debugPrint('ProfileSync: signInWithEmailAndPassword failed for $email: $e2');
                    }
                  }
                }
              }
            }
          } catch (e) {
            debugPrint('ProfileSync: error while attempting to materialize PendingSignup: $e');
          }

          if (user == null) {
            // cannot write until user signs in — stop quietly and wait for auth
            // state change to trigger a future flush.
            debugPrint('ProfileSync: aborting flush; no user signed in');
            break;
          }
        }

        try {
          final db = FirebaseFirestore.instance;
          final doc = db.collection('users').doc(user.uid);
          debugPrint('ProfileSync: flushing item for user ${user.uid}: $data');
          await doc.set(data, SetOptions(merge: true));
          // remove item on success
          await box.deleteAt(0);
          _updateQueueCount();
          debugPrint('ProfileSync: flushed one item, remaining=${box.length}');
            // Notify listeners that queued profile data was applied
            try { EventBus.instance.emitProfileUpdated({'updated': data.keys.toList()}); } catch (_) {}
          attempt = 0; // reset backoff
        } catch (e) {
          debugPrint('ProfileSync: flush attempt failed: $e');
          // If the error is permission-denied, stop retrying for now and leave
          // the item in the queue. Backend/server is expected to reconcile user
          // profiles when client writes are disallowed by security rules.
          if (e is FirebaseException && e.code == 'permission-denied') {
            debugPrint('ProfileSync: permission-denied while flushing; aborting retries');
            break;
          }
          attempt += 1;
          final backoff = Duration(seconds: (2 << (attempt > 6 ? 6 : attempt)));
          await Future.delayed(backoff);
          // retry loop
        }
      }
      debugPrint('ProfileSync: flush complete (queue=${box.length})');
    } finally {
      _flushing = false;
    }
  }

  void _updateQueueCount() {
    if (!_initialized || _box == null) {
      queueCount.value = 0;
      return;
    }
    queueCount.value = _box!.length;
  }

  /// Cleanup resources (stream subscriptions, etc.)
  /// Call this when the app is shutting down or when the service is no longer needed
  Future<void> dispose() async {
    try {
      // Cancel auth state change listener
      if (_authSub != null) {
        await _authSub!.cancel();
        _authSub = null;
        debugPrint('ProfileSync: auth subscription cancelled');
      }
      
      // Close Hive box if it was opened
      if (_box != null && _box!.isOpen) {
        await _box!.close();
        _box = null;
        debugPrint('ProfileSync: Hive box closed');
      }
      
      _initialized = false;
    } catch (e) {
      debugPrint('ProfileSync: error during dispose: $e');
    }
  }
}
