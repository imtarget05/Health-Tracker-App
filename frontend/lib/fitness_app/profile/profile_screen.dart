import 'package:best_flutter_ui_templates/fitness_app/ui_view/title_view.dart';
import 'package:best_flutter_ui_templates/fitness_app/profile/widgets/profile_goals.dart';
import 'package:best_flutter_ui_templates/fitness_app/profile/widgets/profile_header.dart';
import 'package:best_flutter_ui_templates/fitness_app/profile/widgets/profile_state.dart';
import 'package:best_flutter_ui_templates/fitness_app/fitness_app_theme.dart';
import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'dart:io';
import 'package:image_picker/image_picker.dart';
import 'package:firebase_storage/firebase_storage.dart';
import '../../services/profile_sync_service.dart';
import '../../services/auth_storage.dart';
import '../../services/backend_api.dart';
import 'package:best_flutter_ui_templates/services/event_bus.dart';
import '../flutter_login/login.dart';
import 'edit_profile.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key, this.animationController});

  final AnimationController? animationController;

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> with TickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _topBarAnimation;
  final ScrollController _scrollController = ScrollController();
  double topBarOpacity = 0.0;

  Map<String, dynamic>? _backendProfile;
  bool _backendLoading = false;

  @override
  void initState() {
    super.initState();
    _controller = widget.animationController ?? AnimationController(vsync: this, duration: const Duration(milliseconds: 600));
    _topBarAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: const Interval(0.0, 0.5, curve: Curves.fastOutSlowIn)),
    );
  _scrollController.addListener(_scrollControllerListenerSetup);

    if (FirebaseAuth.instance.currentUser == null && AuthStorage.token != null) {
      _loadBackendProfile();
    }
  }

  Future<void> _loadBackendProfile() async {
    if (_backendLoading || AuthStorage.token == null) return;
    setState(() => _backendLoading = true);
    try {
      final token = AuthStorage.token!;
      final resp = await BackendApi.getMe(jwt: token);
      if (resp is Map && resp.containsKey('user') && resp['user'] is Map) {
        _backendProfile = Map<String, dynamic>.from(resp['user'] as Map);
      } else if (resp is Map<String, dynamic>) {
        _backendProfile = Map<String, dynamic>.from(resp);
      }
    } catch (e) {
      debugPrint('ProfileScreen: backend profile fetch failed: $e');
    } finally {
      if (mounted) setState(() => _backendLoading = false);
    }
  }

  void _scrollControllerListenerSetup() {
    final offset = _scrollControllerOffsetSafe();
    if (offset >= 24) {
      if (topBarOpacity != 1.0) setState(() => topBarOpacity = 1.0);
    } else if (topBarOpacity != 0.0) {
      setState(() => topBarOpacity = 0.0);
    }
  }

  double _scrollControllerOffsetSafe() {
    try {
      return _scrollController.hasClients ? _scrollController.offset : 0.0;
    } catch (_) {
      return 0.0;
    }
  }

  @override
  void dispose() {
    _scrollController.removeListener(_scrollControllerListenerSetup);
    _scrollController.dispose();
    if (widget.animationController == null) _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      color: FitnessAppTheme.background,
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: Stack(
          children: <Widget>[
            _buildMainListView(context),
            _buildAppBar(context),
            SizedBox(height: MediaQuery.of(context).padding.bottom),
          ],
        ),
      ),
    );
  }

  Widget _buildAppBar(BuildContext context) {
    return Column(
      children: <Widget>[
        AnimatedBuilder(
          animation: _topBarAnimation,
          builder: (context, child) {
            return FadeTransition(
              opacity: _topBarAnimation,
              child: Container(
                height: AppBar().preferredSize.height + MediaQuery.of(context).padding.top,
                decoration: BoxDecoration(color: FitnessAppTheme.white.withOpacity(topBarOpacity)),
                child: Padding(
                  padding: EdgeInsets.only(top: MediaQuery.of(context).padding.top, left: 16, right: 16),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: <Widget>[
                      Text('Profile', style: TextStyle(fontSize: 20, color: FitnessAppTheme.darkerText)),
                      IconButton(
                        icon: const Icon(Icons.settings),
                        color: FitnessAppTheme.darkerText,
                        onPressed: () {},
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ],
    );
  }

  Widget _buildMainListView(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      if (_backendProfile != null) {
        final data = _backendProfile!;
        final profile = (data['profile'] as Map<String, dynamic>?) ?? {};
        final dailyWaterMl = profile['dailyWaterMl'] is num ? (profile['dailyWaterMl'] as num).toInt() : null;
  // keep drinkingTimes for Daily Goal
        final drinkingTimes = profile['drinkingTimes'] is List ? List<String>.from(profile['drinkingTimes'] as List) : <String>[];
        final name = profile['fullName'] ?? profile['displayName'] ?? profile['name'] ?? '';
        final email = profile['email'] ?? '';
        final avatar = profile['profilePic'] ?? profile['photoURL'] ?? '';
  final calories = (profile['calories'] != null) ? '${profile['calories']} kcal' : '—';
  final currentWeight = (profile['weightKg'] != null) ? (profile['weightKg'] as num).toDouble() : (profile['weight'] is num ? (profile['weight'] as num).toDouble() : null);
  final weight = (profile['idealWeightKg'] != null) ? '${profile['idealWeightKg']} kg' : (currentWeight != null ? '${currentWeight} kg' : '—');
  final height = (profile['heightCm'] != null) ? '${profile['heightCm']} cm' : (profile['height'] != null ? '${profile['height']} cm' : '—');
  final weightKg = currentWeight;
  final heightCm = (profile['heightCm'] is num) ? (profile['heightCm'] as num).toDouble() : (profile['height'] is num ? (profile['height'] as num).toDouble() : null);
  final idealWeightKg = (profile['idealWeightKg'] is num) ? (profile['idealWeightKg'] as num).toDouble() : null;
        final goals = (data['goals'] is List) ? List<String>.from(data['goals']) : <String>[];
  final displayGoals = <String>[...goals];
        if (drinkingTimes.isNotEmpty) displayGoals.add('Drinking times: ${drinkingTimes.join(', ')}');
        if (drinkingTimes.isNotEmpty) displayGoals.add('Drinking times: ${drinkingTimes.join(', ')}');

        return ListView(
          controller: _scrollController,
          padding: EdgeInsets.only(
            top: AppBar().preferredSize.height + MediaQuery.of(context).padding.top + 24,
            bottom: 62 + MediaQuery.of(context).padding.bottom,
          ),
          children: [
            TitleView(titleTxt: 'Bạn', animation: AlwaysStoppedAnimation(1.0), animationController: _controller),
            ProfileHeader(
              imageUrl: avatar,
              name: name,
              email: email,
              weightKg: weightKg,
              heightCm: heightCm,
              dailyWaterMl: dailyWaterMl,
              lastUpdated: null,
              animation: AlwaysStoppedAnimation(1.0),
              animationController: _controller,
              onEdit: () async {
                if (!mounted) return;
                final navigator = Navigator.of(context);
                final saved = await navigator.push<bool>(MaterialPageRoute(builder: (_) => const EditProfilePage()));
                if (!mounted) return;
                if (saved == true) EventBus.instance.emitSuccess('Profile updated successfully');
              },
              onLogout: () async {
                AuthStorage.clear();
                if (!mounted) return;
                EventBus.instance.emitInfo('Signed out');
                Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const LoginPage()), (route) => false);
              },
              onPickAvatar: () async {
                EventBus.instance.emitError('Avatar upload requires Firebase client sign-in');
              },
            ),
            TitleView(titleTxt: 'Thống kê', animation: AlwaysStoppedAnimation(1.0), animationController: _controller),
            // compute BMI goal from idealWeight and height
            ProfileStatsCard(animation: AlwaysStoppedAnimation(1.0), animationController: _controller, calories: calories, weight: weight, height: height, bmi: (() {
              try {
                if (idealWeightKg != null && heightCm != null && heightCm > 0) {
                  final h = heightCm / 100.0;
                  final bmiVal = idealWeightKg / (h * h);
                  return bmiVal.toStringAsFixed(1);
                }
              } catch (_) {}
              return '—';
            })()),
            ProfileGoalCard(animation: AlwaysStoppedAnimation(1.0), animationController: _controller, goals: displayGoals),
          ],
        );
      }

      if (_backendLoading) return const Center(child: CircularProgressIndicator());
  return const Center(child: Text('Please sign in'));
    }

    final docRef = FirebaseFirestore.instance.collection('users').doc(user.uid);
    final safeStream = docRef.snapshots().handleError((e) {
      debugPrint('ProfileScreen: snapshots stream error: $e');
    });

    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: safeStream,
      builder: (context, snap) {
  if (snap.hasError) return Center(child: Text('Unable to load profile: ${snap.error}'));
        if (snap.connectionState == ConnectionState.waiting) return const Center(child: CircularProgressIndicator());
  if (!snap.hasData || snap.data == null || !snap.data!.exists) return const Center(child: Text('No profile data available'));

        final data = snap.data!.data() ?? {};
        final profile = (data['profile'] as Map<String, dynamic>?) ?? {};
        final dailyWaterMl = profile['dailyWaterMl'] is num ? (profile['dailyWaterMl'] as num).toInt() : null;
        final drinkingTimes = profile['drinkingTimes'] is List ? List<String>.from(profile['drinkingTimes'] as List) : <String>[];
        final name = profile['fullName'] ?? profile['displayName'] ?? profile['name'] ?? '';
        final email = profile['email'] ?? '';
        final avatar = profile['profilePic'] ?? profile['photoURL'] ?? '';
  final calories = (profile['calories'] != null) ? '${profile['calories']} kcal' : '—';
  final currentWeight = (profile['weightKg'] is num) ? (profile['weightKg'] as num).toDouble() : (profile['weight'] is num ? (profile['weight'] as num).toDouble() : null);
  final weight = (profile['idealWeightKg'] != null) ? '${profile['idealWeightKg']} kg' : (currentWeight != null ? '${currentWeight} kg' : '—');
  final height = (profile['heightCm'] != null) ? '${profile['heightCm']} cm' : (profile['height'] != null ? '${profile['height']} cm' : '—');
  final weightKg = currentWeight;
  final heightCm = (profile['heightCm'] is num) ? (profile['heightCm'] as num).toDouble() : (profile['height'] is num ? (profile['height'] as num).toDouble() : null);
  final idealWeightKg = (profile['idealWeightKg'] is num) ? (profile['idealWeightKg'] as num).toDouble() : null;
        DateTime? lastUpdated;
        if (snap.data!.data()!.containsKey('lastUpdated')) {
          final t = snap.data!['lastUpdated'];
          if (t is Timestamp) lastUpdated = t.toDate();
        }
        final goals = (data['goals'] is List) ? List<String>.from(data['goals']) : <String>[];
  final displayGoals = <String>[...goals];

        return ListView(
          controller: _scrollController,
          padding: EdgeInsets.only(
            top: AppBar().preferredSize.height + MediaQuery.of(context).padding.top + 24,
            bottom: 62 + MediaQuery.of(context).padding.bottom,
          ),
          children: [
            TitleView(titleTxt: 'Bạn', animation: AlwaysStoppedAnimation(1.0), animationController: _controller),
            ProfileHeader(
              imageUrl: avatar,
              name: name,
              email: email,
              weightKg: weightKg,
              heightCm: heightCm,
              dailyWaterMl: dailyWaterMl,
              lastUpdated: lastUpdated,
              animation: AlwaysStoppedAnimation(1.0),
              animationController: _controller,
              onEdit: () async {
                if (!mounted) return;
                final navigator = Navigator.of(context);
                final saved = await navigator.push<bool>(MaterialPageRoute(builder: (_) => const EditProfilePage()));
                if (!mounted) return;
                if (saved == true) EventBus.instance.emitSuccess('Hồ sơ đã được cập nhật');
              },
              onLogout: () async {
                final navigator = Navigator.of(context);
                await FirebaseAuth.instance.signOut();
                AuthStorage.clear();
                if (!mounted) return;
                EventBus.instance.emitInfo('Đã đăng xuất');
                navigator.pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const LoginPage()), (route) => false);
              },
              onPickAvatar: () async {
                try {
                  final picker = ImagePicker();
                  final file = await picker.pickImage(source: ImageSource.gallery, imageQuality: 85);
                  if (file == null) return;
                  final user = FirebaseAuth.instance.currentUser;
                  if (user == null) return;

                  final storageRef = FirebaseStorage.instance.ref().child('avatars').child(user.uid).child('${DateTime.now().millisecondsSinceEpoch}.jpg');
                  await storageRef.putFile(File(file.path));
                  final downloadUrl = await storageRef.getDownloadURL();

                  final doc = FirebaseFirestore.instance.collection('users').doc(user.uid);
                  final payload = {'profile': {'profilePic': downloadUrl}, 'lastUpdated': FieldValue.serverTimestamp()};
                  await doc.set(payload, SetOptions(merge: true));
                  if (!mounted) return;
                  EventBus.instance.emitSuccess('Avatar updated successfully');
                } catch (e) {
                  final raw = e.toString();
                  if (mounted) {
                    debugPrint('Profile: avatar upload failed: $raw');
                    EventBus.instance.emitError('Unable to update avatar. Please try again.');
                  }
                }
              },
            ),
            TitleView(titleTxt: 'Thống kê', animation: AlwaysStoppedAnimation(1.0), animationController: _controller),
            ProfileStatsCard(animation: AlwaysStoppedAnimation(1.0), animationController: _controller, calories: calories, weight: weight, height: height, bmi: (() {
              try {
                if (idealWeightKg != null && heightCm != null && heightCm > 0) {
                  final h = heightCm / 100.0;
                  final bmiVal = idealWeightKg / (h * h);
                  return bmiVal.toStringAsFixed(1);
                }
              } catch (_) {}
              return '—';
            })()),
            ProfileGoalCard(animation: AlwaysStoppedAnimation(1.0), animationController: _controller, goals: displayGoals),
          ],
        );
      },
    );
  }
}
