import 'dart:io';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import '../../services/backend_api.dart';
import '../../services/auth_storage.dart';
import '../../services/profile_sync_service.dart';
import '../../services/diary_service.dart';
import 'package:best_flutter_ui_templates/services/event_bus.dart';

class EditProfileScreen extends StatefulWidget {
  const EditProfileScreen({super.key});

  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class EditProfilePage extends StatelessWidget {
  const EditProfilePage({super.key});
  @override
  Widget build(BuildContext context) => const EditProfileScreen();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  final ImagePicker _picker = ImagePicker();
  final _auth = FirebaseAuth.instance;
  final _firestore = FirebaseFirestore.instance;

  File? _avatarFile;
  String? _profilePicUrl;

  String name = '';
  String username = '';
  String email = '';
  double? weightKg;
  double? heightCm;
  int? age;
  String? gender;
  int? dailyWaterMl;
  List<String>? drinkingTimes;
  // Extra inputs collected from onboarding screens
  int? idealWeightKg;
  String? deadline;
  double? sleepHours;
  String? exercise;
  int? waterMl;
  String? trainingIntensity;
  String? dietPlan;

  bool _loading = false;
  // debounce timer for auto-save
  Timer? _autoSaveTimer;

  // per-field saved indicators
  final Map<String, bool> _savedFlags = <String, bool>{};
  final Map<String, Timer?> _savedTimers = <String, Timer?>{};

  Map<String, dynamic>? _originalProfile;
  StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>? _docSub;

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  void _markFieldsSaved(List<String> keys, {Duration visibleFor = const Duration(seconds: 3)}) {
    for (final k in keys) {
      _savedTimers[k]?.cancel();
      _savedFlags[k] = true;
      _savedTimers[k] = Timer(visibleFor, () {
        _savedFlags.remove(k);
        _savedTimers[k]?.cancel();
        _savedTimers.remove(k);
        if (mounted) setState(() {});
      });
    }
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _docSub?.cancel();
    super.dispose();
  }

  Future<void> _mergeQueuedProfileData() async {
    try {
      final items = ProfileSyncService.instance.readQueue();
      if (items.isEmpty) return;
      Map<String, dynamic>? last;
      for (final it in items) {
        if (it is Map && it.containsKey('data')) {
          final data = it['data'];
          if (data is Map && data.containsKey('profile')) {
            last = Map<String, dynamic>.from(data['profile'] as Map);
          }
          if (data is Map && data.containsKey('habit')) {
            final h = Map<String, dynamic>.from(data['habit'] as Map);
            // merge habit keys into last so UI can pick them up
            last ??= {};
            for (final k in h.keys) {
              last![k] = h[k];
            }
          } else if (data is Map) {
            last = Map<String, dynamic>.from(data);
          }
        } else if (it is Map) {
          last = Map<String, dynamic>.from(it);
        }
      }
      if (last == null) return;
      final l = last;
      setState(() {
        name = (l['name'] ?? l['fullName'] ?? name) as String;
        username = (l['username'] ?? username) as String;
        if (l['email'] is String) email = l['email'] as String;
        if (l['weightKg'] != null) weightKg = (l['weightKg'] as num).toDouble();
        if (l['heightCm'] != null) heightCm = (l['heightCm'] as num).toDouble();
        if (l['age'] != null) age = (l['age'] as num).toInt();
        if (l['gender'] is String) gender = l['gender'] as String;
        if (l['dailyWaterMl'] != null) dailyWaterMl = (l['dailyWaterMl'] as num).toInt();
        if (l['drinkingTimes'] is List) drinkingTimes = List<String>.from(l['drinkingTimes'] as List);
  if (l['idealWeightKg'] != null) idealWeightKg = (l['idealWeightKg'] as num).toInt();
  if (l['deadline'] is String) deadline = l['deadline'] as String;
  if (l['sleepHours'] != null) sleepHours = (l['sleepHours'] as num).toDouble();
  if (l['exercise'] is String) exercise = l['exercise'] as String;
  if (l['waterMl'] != null) waterMl = (l['waterMl'] as num).toInt();
  if (l['trainingIntensity'] is String) trainingIntensity = l['trainingIntensity'] as String;
  if (l['dietPlan'] is String) dietPlan = l['dietPlan'] as String;
      });
    } catch (e) {
      debugPrint('mergeQueuedProfileData error: $e');
    }
  }

  Future<void> _loadProfile() async {
    final user = _auth.currentUser;
    if (user != null) {
      try {
        final doc = await _firestore.collection('users').doc(user.uid).get();
        if (doc.exists) {
          final data = Map<String, dynamic>.from(doc.data()!);
          _originalProfile = Map<String, dynamic>.from(data);
          if (_originalProfile != null && _originalProfile!['profile'] is Map) {
            final nested = Map<String, dynamic>.from(_originalProfile!['profile'] as Map);
            for (final k in nested.keys) {
              _originalProfile![k] = nested[k];
            }
              }
              // also merge 'habit' nested map into original profile so UI can read habit fields
              if (_originalProfile != null && _originalProfile!['habit'] is Map) {
                final h = Map<String, dynamic>.from(_originalProfile!['habit'] as Map);
                for (final k in h.keys) {
                  _originalProfile![k] = h[k];
                }
          }
          setState(() {
            name = (data['name'] ?? data['fullName'] ?? name) as String;
            username = (data['username'] ?? username) as String;
            email = (user.email ?? (data['email'] ?? '')) as String;
            if (data['weightKg'] != null) weightKg = (data['weightKg'] as num).toDouble();
            if (data['heightCm'] != null) heightCm = (data['heightCm'] as num).toDouble();
            if (data['age'] != null) age = (data['age'] as num).toInt();
            if (data['gender'] is String) gender = data['gender'] as String;
            _profilePicUrl = (data['profilePic'] ?? '') as String?;
                // habit/profile specific
                if (data['idealWeightKg'] != null) idealWeightKg = (data['idealWeightKg'] as num).toInt();
                if (data['deadline'] is String) deadline = data['deadline'] as String;
                if (data['sleepHours'] != null) sleepHours = (data['sleepHours'] as num).toDouble();
                if (data['exercise'] is String) exercise = data['exercise'] as String;
                if (data['waterMl'] != null) waterMl = (data['waterMl'] as num).toInt();
                if (data['trainingIntensity'] is String) trainingIntensity = data['trainingIntensity'] as String;
                if (data['dietPlan'] is String) dietPlan = data['dietPlan'] as String;
          });
        }
      } catch (e) {
        debugPrint('loadProfile firestore error: $e');
      }
      await _mergeQueuedProfileData();
      try {
        _docSub?.cancel();
        _docSub = _firestore.collection('users').doc(user.uid).snapshots().listen((snap) {
          if (!snap.exists) return;
          final data = snap.data();
          if (data == null) return;
          final nested = (data['profile'] is Map) ? Map<String, dynamic>.from(data['profile'] as Map) : <String, dynamic>{};
          final image = (nested['profilePic'] ?? data['profilePic'] ?? '') as String?;
          if ((image ?? '').isNotEmpty && _avatarFile == null) {
            setState(() => _profilePicUrl = image);
          }
        });
      } catch (e) {
        debugPrint('subscribe doc error: $e');
      }
      return;
    }
    final token = AuthStorage.token;
    if (token == null) return;
    try {
      final backend = await BackendApi.getMe(jwt: token);
      final data = Map<String, dynamic>.from(backend);
      _originalProfile = Map<String, dynamic>.from(data);
      if (_originalProfile != null && _originalProfile!['profile'] is Map) {
        final nested = Map<String, dynamic>.from(_originalProfile!['profile'] as Map);
        for (final k in nested.keys) {
          _originalProfile![k] = nested[k];
        }
      }
      if (_originalProfile != null && _originalProfile!['habit'] is Map) {
        final h = Map<String, dynamic>.from(_originalProfile!['habit'] as Map);
        for (final k in h.keys) {
          _originalProfile![k] = h[k];
        }
      }
      setState(() {
        name = (data['name'] ?? data['fullName'] ?? name) as String;
        username = (data['username'] ?? username) as String;
        email = (data['email'] ?? email) as String;
        if (data['weightKg'] != null) weightKg = (data['weightKg'] as num).toDouble();
        if (data['heightCm'] != null) heightCm = (data['heightCm'] as num).toDouble();
        if (data['age'] != null) age = (data['age'] as num).toInt();
        if (data['gender'] is String) gender = data['gender'] as String;
        if (data['dailyWaterMl'] != null) dailyWaterMl = (data['dailyWaterMl'] as num).toInt();
        if (data['drinkingTimes'] is List) drinkingTimes = List<String>.from(data['drinkingTimes'] as List);
        _profilePicUrl = (data['profilePic'] ?? '') as String?;
        if (data['idealWeightKg'] != null) idealWeightKg = (data['idealWeightKg'] as num).toInt();
        if (data['deadline'] is String) deadline = data['deadline'] as String;
        if (data['sleepHours'] != null) sleepHours = (data['sleepHours'] as num).toDouble();
        if (data['exercise'] is String) exercise = data['exercise'] as String;
        if (data['waterMl'] != null) waterMl = (data['waterMl'] as num).toInt();
        if (data['trainingIntensity'] is String) trainingIntensity = data['trainingIntensity'] as String;
        if (data['dietPlan'] is String) dietPlan = data['dietPlan'] as String;
      });
      await _mergeQueuedProfileData();
    } catch (e) {
      debugPrint('loadProfile backend error: $e');
    }
  }

  Future<void> _pickAvatar() async {
    final XFile? image = await _picker.pickImage(source: ImageSource.gallery);
    if (image == null) return;
    setState(() {
      _avatarFile = File(image.path);
      _profilePicUrl = null;
    });
  }

  /// Save changes locally (enqueue) but do NOT upload or write to backend/Firestore.
  /// This is used by autosave so user edits don't trigger network writes until
  /// they explicitly press the bottom Save button.
  Future<void> _saveLocally() async {
    final update = <String, dynamic>{};
    void put(String k, dynamic v) {
      if (v == null) return;
      final orig = _originalProfile != null ? (_originalProfile![k] ?? (_originalProfile!['profile'] is Map ? (_originalProfile!['profile'] as Map)[k] : null)) : null;
      if (v is num) {
        if (orig is num) {
          if (orig.toDouble() != (v as num).toDouble()) update[k] = v;
        } else {
          update[k] = v;
        }
      } else {
        if ((orig == null && v.toString().isNotEmpty) || (orig != null && orig.toString() != v.toString())) update[k] = v;
      }
    }
    put('fullName', name);
    put('username', username);
    put('email', email);
    put('weightKg', weightKg);
    put('heightCm', heightCm);
    put('age', age);
    put('gender', gender);
    put('dailyWaterMl', dailyWaterMl);
    put('drinkingTimes', drinkingTimes);
    // Do not include profilePic here; pickAvatar only sets local preview
    // and upload should happen on explicit Save.
    // onboarding / habit fields
    put('idealWeightKg', idealWeightKg);
    put('deadline', deadline);
    put('sleepHours', sleepHours);
    put('exercise', exercise);
    put('waterMl', waterMl);
    put('trainingIntensity', trainingIntensity);
    put('dietPlan', dietPlan);
    if (update.isEmpty) return;
    update['createdAt'] = DateTime.now().toIso8601String();
    try {
      // Save to local queue for later flush
      final payload = Map<String, dynamic>.from(update);
      final profileMap = <String, dynamic>{};
      const mirror = ['fullName', 'weightKg', 'heightKg', 'heightCm', 'email', 'username', 'age', 'gender', 'dailyWaterMl', 'drinkingTimes'];
      for (final k in update.keys) {
        // we'll just pass update through; ProfileSync will interpret
      }
      await ProfileSyncService.instance.saveProfilePartial({'profile': update});
      // mark saved indicators for fields (exclude profilePic)
      _markFieldsSaved(update.keys.toList());
    } catch (e) {
      debugPrint('EditProfile: local enqueue failed: $e');
    }
  }

  Future<void> _saveProfile({bool popAfter = true}) async {
    if (_loading) return;
    final user = _auth.currentUser;
    final jwt = AuthStorage.token;
    if (user == null && jwt == null) {
  EventBus.instance.emitError('User not signed in');
      return;
    }
    if (mounted) setState(() => _loading = true);
    if (_avatarFile != null && jwt != null) {
      try {
        final resp = await BackendApi.uploadFile(jwt: jwt, endpointPath: '/upload/avatar', filePath: _avatarFile!.path, fieldName: 'file');
        final imageUrl = resp['imageUrl'] as String?;
        if (imageUrl != null) _profilePicUrl = imageUrl;
      } catch (e) {
        debugPrint('avatar upload failed: $e');
      }
    }
    final update = <String, dynamic>{};
    void put(String k, dynamic v) {
      if (v == null) return;
      final orig = _originalProfile != null ? (_originalProfile![k] ?? (_originalProfile!['profile'] is Map ? (_originalProfile!['profile'] as Map)[k] : null)) : null;
      if (v is num) {
        if (orig is num) {
          if (orig.toDouble() != (v as num).toDouble()) update[k] = v;
        } else {
          update[k] = v;
        }
      } else {
        if ((orig == null && v.toString().isNotEmpty) || (orig != null && orig.toString() != v.toString())) update[k] = v;
      }
    }
    put('fullName', name);
    put('username', username);
    put('email', email);
    put('weightKg', weightKg);
    put('heightCm', heightCm);
    put('age', age);
    put('gender', gender);
    put('dailyWaterMl', dailyWaterMl);
    put('drinkingTimes', drinkingTimes);
    put('profilePic', _profilePicUrl);
  // onboarding / habit fields
  put('idealWeightKg', idealWeightKg);
  put('deadline', deadline);
  put('sleepHours', sleepHours);
  put('exercise', exercise);
  put('waterMl', waterMl);
  put('trainingIntensity', trainingIntensity);
  put('dietPlan', dietPlan);
    if (update.isEmpty) {
      EventBus.instance.emitInfo('Không có thay đổi để lưu');
      if (mounted) setState(() => _loading = false);
      return;
    }
    update['updatedAt'] = DateTime.now().toIso8601String();
    bool backendOk = false;
    String? backendErr;
    if (jwt != null) {
      try {
        final base = dotenv.env['BACKEND_URL'] ?? 'http://localhost:8080';
        final url = Uri.parse('$base/auth/update-profile');
    // Call backend with a short timeout so UI doesn't hang when backend unreachable.
    final resp = await http
      .put(url, headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer $jwt'}, body: json.encode(update))
      .timeout(const Duration(seconds: 4));
        if (resp.statusCode >= 200 && resp.statusCode < 300) {
          backendOk = true;
          _originalProfile ??= {};
          _originalProfile!.addAll(update);
          if (user != null) {
            try {
              final payload = Map<String, dynamic>.from(update);
              final profileMap = <String, dynamic>{};
              const mirror = ['profilePic', 'fullName', 'weightKg', 'heightCm', 'email', 'username', 'age', 'gender', 'dailyWaterMl', 'drinkingTimes'];
              for (final k in mirror) {
                if (update.containsKey(k)) {
                  profileMap[k] = update[k];
                }
              }
              if (profileMap.isNotEmpty) payload['profile'] = profileMap;
              await _firestore.collection('users').doc(user.uid).set(payload, SetOptions(merge: true));
                  // also write 'habit' when relevant
                  try {
                    final habitMap = <String, dynamic>{};
                    if (update.containsKey('sleepHours')) habitMap['sleepHours'] = update['sleepHours'];
                    if (update.containsKey('exercise')) habitMap['exercise'] = update['exercise'];
                    if (update.containsKey('waterMl')) habitMap['waterMl'] = update['waterMl'];
                    if (habitMap.isNotEmpty) {
                      await _firestore.collection('users').doc(user.uid).set({'habit': habitMap}, SetOptions(merge: true));
                    }
                  } catch (e) {
                    debugPrint('habit mirror write failed: $e');
                  }
            } catch (e) {
              debugPrint('mirror write failed: $e');
            }
          }
        } else {
          try {
            final b = jsonDecode(resp.body);
            if (b is Map && b.containsKey('message')) backendErr = b['message'].toString();
            else backendErr = resp.body;
          } catch (_) {
            backendErr = 'Server ${resp.statusCode}';
          }
        }
      } catch (e) {
        // backend failed (timeout/connection/etc). Record error but continue to fallback.
        backendErr = e.toString();
        debugPrint('EditProfile: backend update failed: $backendErr');
      }
    }
    if (!backendOk && user == null) {
      // Cannot reach backend and user is not signed into Firebase. Save partial locally for later sync
      try {
        final payload = Map<String, dynamic>.from(update);
        final profileMap = <String, dynamic>{};
        const mirror = ['profilePic', 'fullName', 'weightKg', 'heightCm', 'email', 'username', 'age', 'gender', 'dailyWaterMl', 'drinkingTimes'];
        for (final k in mirror) {
          if (update.containsKey(k)) {
            profileMap[k] = update[k];
          }
        }
        if (profileMap.isNotEmpty) payload['profile'] = profileMap;
        // habit fields
        final habitMap = <String, dynamic>{};
        if (update.containsKey('sleepHours')) habitMap['sleepHours'] = update['sleepHours'];
        if (update.containsKey('exercise')) habitMap['exercise'] = update['exercise'];
        if (update.containsKey('waterMl')) habitMap['waterMl'] = update['waterMl'];
        if (habitMap.isNotEmpty) payload['habit'] = habitMap;

        await ProfileSyncService.instance.saveProfilePartial(payload);
  EventBus.instance.emitInfo('Saved locally. Will sync when online or after sign-in.');
        // Emit profile-updated for all keys except profilePic so that the
        // Profile screen doesn't immediately show an unsynced avatar image.
        try {
          final emitKeys = update.keys.where((k) => k != 'profilePic').toList();
          if (emitKeys.isNotEmpty) EventBus.instance.emitProfileUpdated({'updated': emitKeys});
        } catch (_) {}
        // show per-field saved indicators for keys except profilePic
        final marked = update.keys.where((k) => k != 'profilePic').toList();
        if (marked.isNotEmpty) _markFieldsSaved(marked);
        if (popAfter && mounted) Navigator.of(context).pop(true);
      } catch (e) {
        debugPrint('EditProfile: local-save failed: ${e.toString()} backendErr=$backendErr');
  EventBus.instance.emitError('Unable to save profile. Please try again.');
      }
      if (mounted) setState(() => _loading = false);
      return;
    }
    if (!backendOk || user != null) {
      try {
        final payload = Map<String, dynamic>.from(update);
        final profileMap = <String, dynamic>{};
        const mirror = ['profilePic', 'fullName', 'weightKg', 'heightCm', 'email', 'username', 'age', 'gender', 'dailyWaterMl', 'drinkingTimes'];
        for (final k in mirror) {
          if (update.containsKey(k)) {
            profileMap[k] = update[k];
          }
        }
        if (profileMap.isNotEmpty) payload['profile'] = profileMap;
        await _firestore.collection('users').doc(user!.uid).set(payload, SetOptions(merge: true));
        _originalProfile ??= {};
        _originalProfile!.addAll(update);
        if (_originalProfile != null && _originalProfile!['profile'] is! Map) _originalProfile!['profile'] = {};
        final p = Map<String, dynamic>.from((_originalProfile != null && _originalProfile!['profile'] is Map) ? Map<String, dynamic>.from(_originalProfile!['profile'] as Map) : <String, dynamic>{});
        p.addAll(profileMap);
        _originalProfile!['profile'] = p;
  EventBus.instance.emitSuccess('Profile updated successfully');
  try { 
    final emitKeys = update.keys.where((k) => k != 'profilePic' || (_profilePicUrl != null && _profilePicUrl!.isNotEmpty)).toList();
    if (emitKeys.isNotEmpty) EventBus.instance.emitProfileUpdated({'updated': emitKeys}); 
  } catch (_) {}
  // mark fields as saved for UI feedback (exclude profilePic unless upload produced a URL)
  final markedKeys = update.keys.where((k) => k != 'profilePic' || (_profilePicUrl != null && _profilePicUrl!.isNotEmpty)).toList();
  if (markedKeys.isNotEmpty) _markFieldsSaved(markedKeys);
  if (popAfter && mounted) Navigator.of(context).pop(true);
        try {
          final diary = DiaryService(FirebaseFirestore.instance, user.uid);
          if (update.containsKey('weightKg') && weightKg != null) await diary.updateWeight(DateTime.now(), weightKg!, source: 'profile');
          if (update.containsKey('dailyWaterMl') && dailyWaterMl != null) await diary.setDailyWaterGoal(DateTime.now(), dailyWaterMl!);
          if (heightCm != null && weightKg != null) {
            final bmi = (weightKg! / ((heightCm! / 100) * (heightCm! / 100)));
            await diary.updateBodyMeasurements(DateTime.now(), heightCm!, double.parse(bmi.toStringAsFixed(1)), 0.0);
          }
        } catch (e) {
          debugPrint('diary sync error: $e');
        }
      } catch (e) {
  EventBus.instance.emitError('Unable to save profile');
      } finally {
        if (mounted) setState(() => _loading = false);
      }
    } else {
  EventBus.instance.emitSuccess('Cập nhật hồ sơ thành công');
  try {
    final emitKeys = update.keys.where((k) => k != 'profilePic' || (_profilePicUrl != null && _profilePicUrl!.isNotEmpty)).toList();
    if (emitKeys.isNotEmpty) EventBus.instance.emitProfileUpdated({'updated': emitKeys});
  } catch (_) {}
        // mark fields saved (exclude profilePic unless upload produced a URL)
        final mk = update.keys.where((k) => k != 'profilePic' || (_profilePicUrl != null && _profilePicUrl!.isNotEmpty)).toList();
        if (mk.isNotEmpty) _markFieldsSaved(mk);
        if (mounted) {
        setState(() => _loading = false);
        if (popAfter) Navigator.of(context).pop(true);
      }
    }
  }

  Future<void> _editFieldDialog(String title, String init, ValueChanged<String> onSave) async {
    final c = TextEditingController(text: init);
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom + 16, left: 16, right: 16, top: 16),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            TextField(controller: c, autofocus: true, decoration: const InputDecoration(border: OutlineInputBorder())),
            const SizedBox(height: 12),
            SizedBox(width: double.infinity, child: ElevatedButton(onPressed: () {
              onSave(c.text);
              // schedule autosave after dialog closes
              Navigator.pop(ctx);
              _scheduleAutoSave();
            }, child: const Text('Lưu'))),
          ]),
        );
      },
    );
  }

  void _scheduleAutoSave({Duration delay = const Duration(milliseconds: 700)}) {
    _autoSaveTimer?.cancel();
    _autoSaveTimer = Timer(delay, () {
      // call save but do not block UI
  _saveLocally();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Edit Profile'), backgroundColor: Colors.white, foregroundColor: Colors.black),
      body: Stack(children: [
        SafeArea(
          child: SingleChildScrollView(
            child: Column(children: [
            const SizedBox(height: 16),
            // Disable interactions while loading to avoid partial state changes
            AbsorbPointer(absorbing: _loading, child: Column(children: [
              GestureDetector(
                onTap: _loading ? null : _pickAvatar,
                child: CircleAvatar(radius: 44, backgroundImage: _avatarFile != null ? FileImage(_avatarFile!) : (_profilePicUrl != null && _profilePicUrl!.isNotEmpty ? NetworkImage(_profilePicUrl!) : const NetworkImage('https://i.pravatar.cc/300')) as ImageProvider),
              ),
              TextButton(onPressed: _loading ? null : _pickAvatar, child: const Text('Edit avatar')),
            ])),
            const SizedBox(height: 8),
            ListTile(
              title: const Text('Name'),
              subtitle: Text(name.isEmpty ? '—' : name),
              onTap: _loading ? null : () => _editFieldDialog('Name', name, (v) => setState(() => name = v)),
              trailing: _savedFlags['fullName'] == true ? const Text('Saved', style: TextStyle(color: Colors.green, fontSize: 12)) : null,
            ),
            ListTile(
              title: const Text('Username'),
              subtitle: Text(username.isEmpty ? '—' : username),
              onTap: _loading ? null : () => _editFieldDialog('Username', username, (v) => setState(() => username = v)),
              trailing: _savedFlags['username'] == true ? const Text('Saved', style: TextStyle(color: Colors.green, fontSize: 12)) : null,
            ),
            ListTile(
              title: const Text('Email'),
              subtitle: Text(email.isEmpty ? '—' : email),
              onTap: _loading ? null : () => _editFieldDialog('Email', email, (v) => setState(() => email = v)),
              trailing: _savedFlags['email'] == true ? const Text('Saved', style: TextStyle(color: Colors.green, fontSize: 12)) : null,
            ),
            ListTile(
              title: const Text('Weight (kg)'),
              subtitle: Text(weightKg != null ? weightKg!.toStringAsFixed(1) : '—'),
              onTap: _loading ? null : () => _editFieldDialog('Weight (kg)', weightKg?.toString() ?? '', (v) { final n = double.tryParse(v); if (n != null) setState(() => weightKg = n); }),
              trailing: _savedFlags['weightKg'] == true ? const Text('Saved', style: TextStyle(color: Colors.green, fontSize: 12)) : null,
            ),
            ListTile(
              title: const Text('Height (cm)'),
              subtitle: Text(heightCm != null ? heightCm!.toStringAsFixed(0) : '—'),
              onTap: _loading ? null : () => _editFieldDialog('Height (cm)', heightCm?.toString() ?? '', (v) { final n = double.tryParse(v); if (n != null) setState(() => heightCm = n); }),
              trailing: _savedFlags['heightCm'] == true ? const Text('Saved', style: TextStyle(color: Colors.green, fontSize: 12)) : null,
            ),
            // Onboarding / habit fields
            ListTile(
              title: const Text('Ideal weight (kg)'),
              subtitle: Text(idealWeightKg != null ? idealWeightKg.toString() : '—'),
              onTap: _loading ? null : () => _editFieldDialog('Ideal weight (kg)', idealWeightKg?.toString() ?? '', (v) { final n = int.tryParse(v); if (n != null) setState(() => idealWeightKg = n); }),
              trailing: _savedFlags['idealWeightKg'] == true ? const Text('Saved', style: TextStyle(color: Colors.green, fontSize: 12)) : null,
            ),
            ListTile(
              title: const Text('Deadline'),
              subtitle: Text(deadline ?? '—'),
              onTap: _loading ? null : () async {
              final picked = await showDatePicker(context: context, initialDate: DateTime.tryParse(deadline ?? '') ?? DateTime.now(), firstDate: DateTime.now(), lastDate: DateTime.now().add(const Duration(days: 365*5)));
              if (picked != null) {
                setState(() => deadline = '${picked.year}-${picked.month.toString().padLeft(2,'0')}-${picked.day.toString().padLeft(2,'0')}');
                _scheduleAutoSave();
                // mark visible immediately so user sees feedback
                _savedFlags['deadline'] = true;
                _savedTimers['deadline']?.cancel();
                _savedTimers['deadline'] = Timer(const Duration(seconds: 3), () { _savedFlags.remove('deadline'); if (mounted) setState(() {}); });
                if (mounted) setState(() {});
              }
            }),
            ListTile(
              title: const Text('Sleep (hours)'),
              subtitle: Text(sleepHours != null ? sleepHours!.toStringAsFixed(1) : '—'),
              onTap: _loading ? null : () async {
              double value = sleepHours ?? 8.0;
              await showModalBottomSheet(context: context, builder: (ctx) {
                return StatefulBuilder(builder: (ctx2, setState2) {
                  return Padding(padding: const EdgeInsets.all(16.0), child: Column(mainAxisSize: MainAxisSize.min, children: [
                          const Text('Select sleep hours', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                    Slider(min: 0, max: 24, divisions: 48, value: value, label: '${value.toStringAsFixed(1)} h', onChanged: (v) => setState2(() => value = v)),
                    Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Text('${value.toStringAsFixed(1)} hours'), ElevatedButton(onPressed: () { setState(() => sleepHours = value); Navigator.of(ctx).pop(); _scheduleAutoSave(); }, child: const Text('Confirm'))])
                  ]));
                });
              });
              },
              trailing: _savedFlags['sleepHours'] == true ? const Text('Saved', style: TextStyle(color: Colors.green, fontSize: 12)) : null,
            ),
            ListTile(
              title: const Text('Favourite exercise'),
              subtitle: Text(exercise ?? '—'),
              onTap: _loading ? null : () => _editFieldDialog('Favourite exercise', exercise ?? '', (v) => setState(() => exercise = v)),
              trailing: _savedFlags['exercise'] == true ? const Text('Saved', style: TextStyle(color: Colors.green, fontSize: 12)) : null,
            ),
            ListTile(
              title: const Text('Water (ml)'),
              subtitle: Text(waterMl != null ? waterMl.toString() : '—'),
              onTap: _loading ? null : () => _editFieldDialog('Water (ml)', waterMl?.toString() ?? '', (v) { final n = int.tryParse(v); if (n != null) { setState(() => waterMl = n); _scheduleAutoSave(); } }),
              trailing: _savedFlags['waterMl'] == true ? const Text('Saved', style: TextStyle(color: Colors.green, fontSize: 12)) : null,
            ),
            ListTile(
              title: const Text('Drinking times'),
              subtitle: Text((drinkingTimes != null && drinkingTimes!.isNotEmpty) ? drinkingTimes!.join(', ') : '—'),
              onTap: _loading ? null : () async {
                final init = (drinkingTimes != null && drinkingTimes!.isNotEmpty) ? drinkingTimes!.join(', ') : '';
                final c = TextEditingController(text: init);
                await showModalBottomSheet(context: context, isScrollControlled: true, builder: (ctx) {
                  return Padding(
                    padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom + 16, left: 16, right: 16, top: 16),
                    child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('Drinking times (comma separated, e.g. 08:00, 12:00, 18:00)', style: TextStyle(fontWeight: FontWeight.bold)),
                      const SizedBox(height: 8),
                      TextField(controller: c, autofocus: true, decoration: const InputDecoration(border: OutlineInputBorder())),
                      const SizedBox(height: 12),
                      SizedBox(width: double.infinity, child: ElevatedButton(onPressed: () {
                        final text = c.text.trim();
                        if (text.isEmpty) {
                          setState(() => drinkingTimes = <String>[]);
                        } else {
                          final parts = text.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
                          setState(() => drinkingTimes = parts);
                        }
                        Navigator.pop(ctx);
                        _scheduleAutoSave();
                      }, child: const Text('Lưu'))),
                    ]),
                  );
                });
              },
            ),
            ListTile(title: const Text('Training intensity'), subtitle: Text(trainingIntensity ?? '—'), onTap: _loading ? null : () => _editFieldDialog('Training intensity', trainingIntensity ?? '', (v) => setState(() => trainingIntensity = v))),
            ListTile(title: const Text('Diet plan'), subtitle: Text(dietPlan ?? '—'), onTap: _loading ? null : () => _editFieldDialog('Diet plan', dietPlan ?? '', (v) => setState(() => dietPlan = v))),
            const SizedBox(height: 24),
            Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: SizedBox(width: double.infinity, child: ElevatedButton(onPressed: _loading ? null : () => _saveProfile(popAfter: true), child: _loading ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('Save')))),
            const SizedBox(height: 24),
          ]),
        ),
      ),
        // loading overlay
        if (_loading)
          Positioned.fill(child: Container(color: Colors.black45, child: const Center(child: CircularProgressIndicator()))),
      ]),
    );
  }
}
