import 'package:best_flutter_ui_templates/fitness_app/ui_view/wave_view.dart';
import 'package:best_flutter_ui_templates/fitness_app/fitness_app_theme.dart';
import 'package:best_flutter_ui_templates/main.dart';
import 'package:flutter/material.dart';
import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:best_flutter_ui_templates/services/event_bus.dart';
import '../../models/diary.dart';
import '../../services/diary_service.dart';

class WaterView extends StatefulWidget {
  const WaterView(
      {super.key, this.mainScreenAnimationController, this.mainScreenAnimation, this.diary, this.profile, this.profileNotifier});

  final AnimationController? mainScreenAnimationController;
  final Animation<double>? mainScreenAnimation;
  final dynamic diary;
  final Map<String, dynamic>? profile;
  // Optional notifier to react to in-place profile updates (e.g., reminders change water goal)
  final ValueNotifier<Map<String, dynamic>>? profileNotifier;

  @override
  State<WaterView> createState() => _WaterViewState();
}

class _WaterViewState extends State<WaterView> with TickerProviderStateMixin {
  Future<bool> getData() async {
    await Future<dynamic>.delayed(const Duration(milliseconds: 50));
    return true;
  }

  late AnimationController waterController;
  late Animation<double> waterAnimation;
  double currentAmount = 0; // inf (backed by Firestore)
  int dailyGoal = 3500; // default daily goal (ml)
  late DiaryService diaryService;
  StreamSubscription<Diary?>? _diarySub;
  StreamSubscription<User?>? _authSub;
  VoidCallback? _profileNotifierListener;

  void increaseWater() {
    // Use DiaryService transaction to increment water by 100ml
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;
  // scaffold not used; toasts are emitted via EventBus
    diaryService.incrementWater(DateTime.now(), 100).catchError((e) {
  EventBus.instance.emitError('Failed to add water');
    });
  }

  void decreaseWater() {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;
    diaryService.incrementWater(DateTime.now(), -100).catchError((e) {
  EventBus.instance.emitError('Failed to remove water');
    });
  }

  double get percentageValue {
  return (dailyGoal == 0) ? 0 : (currentAmount / dailyGoal) * 100;
  }

  @override
  void initState() {
    super.initState();

  waterController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    );

    waterAnimation = Tween<double>(begin: 0, end: 2100).animate(
      CurvedAnimation(parent: waterController, curve: Curves.easeOut),
    )..addListener(() {
  // Do not overwrite currentAmount from animation tick; currentAmount is driven by diary stream.
  // Keep animation for visual effects only if needed.
    });

  // prefer profile daily water when provided (also check notifier value)
  final profileMap = widget.profileNotifier?.value ?? widget.profile;
  // prefer 'waterMl' (edit_profile 'Water (ml)') if present, otherwise fall back to 'dailyWaterMl'
  if (profileMap != null) {
    if (profileMap['waterMl'] != null) {
      dailyGoal = (profileMap['waterMl'] as num).toInt();
    } else if (profileMap['dailyWaterMl'] != null) {
      dailyGoal = (profileMap['dailyWaterMl'] as num).toInt();
    }
  }
  // subscribe to notifier if present so UI updates when reminders change profile
    if (widget.profileNotifier != null) {
      _profileNotifierListener = () {
        if (!mounted) return;
        final p = widget.profileNotifier!.value;
        setState(() {
          if (p != null) {
            if (p['waterMl'] != null) dailyGoal = (p['waterMl'] as num).toInt();
            else if (p['dailyWaterMl'] != null) dailyGoal = (p['dailyWaterMl'] as num).toInt();
          }
        });
      };
      widget.profileNotifier!.addListener(_profileNotifierListener!);
    }
  waterController.forward();

  // Initialize DiaryService when auth state available
    _authSub = FirebaseAuth.instance.authStateChanges().listen((user) {
      // always cancel previous diary subscription when auth changes
      _diarySub?.cancel();
      if (user != null) {
        diaryService = DiaryService(FirebaseFirestore.instance, user.uid);
        // protect the stream from throwing unhandled exceptions by handling errors
        final safeStream = diaryService.streamDiary(DateTime.now()).handleError((e) {
          debugPrint('WaterView: diary stream error (handleError): $e');
          // swallow errors here; we'll also report via onError below
        });

        _diarySub = safeStream.listen((d) {
          if (d != null) {
            if (!mounted) return;
            setState(() {
        // if widget was created with a diary prop, prefer it; otherwise use stream value
        currentAmount = widget.diary != null && widget.diary.water != null
          ? widget.diary.water!.consumedMl.toDouble()
          : (d.water?.consumedMl.toDouble() ?? currentAmount);
        dailyGoal = widget.diary != null && widget.diary.water != null
          ? widget.diary.water!.dailyGoalMl
          : (d.water?.dailyGoalMl ?? dailyGoal);
            });
          }
        }, onError: (e) {
          // catch permission-denied and other errors from the listen
          debugPrint('WaterView: diary listen error: $e');
          if (!mounted) return;
          // reset to safe defaults so UI remains stable
          setState(() {
            currentAmount = 0;
            dailyGoal = 3500;
          });
        });
      } else {
        // no user -> reset values and avoid subscribing
        if (!mounted) return;
        setState(() {
          currentAmount = 0;
          dailyGoal = 3500;
        });
      }
    }, onError: (e) {
      debugPrint('WaterView: authStateChanges error: $e');
      // keep UI stable on auth stream errors
    });
  }
  @override
  void dispose() {
    waterController.dispose();
    _diarySub?.cancel();
    _authSub?.cancel();
    
    // Remove profile notifier listener
    if (widget.profileNotifier != null && _profileNotifierListener != null) {
      widget.profileNotifier!.removeListener(_profileNotifierListener!);
    }
    
    super.dispose();
  }


  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.mainScreenAnimationController!,
      builder: (BuildContext context, Widget? child) {
        // Shared computations for scheduled slots / UI amount
        final profileMap = widget.profileNotifier?.value ?? widget.profile;
        List<String> _times = [];
        try {
          if (profileMap != null && profileMap['drinkingTimes'] is List) _times = List<String>.from(profileMap['drinkingTimes'] as List);
        } catch (_) {}
  // If no drinkingTimes configured, treat count as 0 (no dots) instead of defaulting to 3.
  final int _count = _times.isNotEmpty ? _times.length : 0;
        final double _perSlot = (_count > 0) ? (dailyGoal / _count) : dailyGoal.toDouble();
        final now = DateTime.now();
        int _passedScheduled = 0;
        DateTime? _lastPassed;
        final List<DateTime> _schedList = [];
        try {
          for (var t in _times) {
            if (t is String) {
              final parts = t.split(':');
              if (parts.length >= 2) {
                final hh = int.tryParse(parts[0]) ?? 0;
                final mm = int.tryParse(parts[1]) ?? 0;
                final sched = DateTime(now.year, now.month, now.day, hh, mm);
                _schedList.add(sched);
                if (!sched.isAfter(now)) {
                  _passedScheduled += 1;
                  if (_lastPassed == null || sched.isAfter(_lastPassed)) _lastPassed = sched;
                }
              }
            }
          }
        } catch (_) {}

        final double _perSlotSafe = _perSlot > 0 ? _perSlot : 0.0;
        final int _completedSlots = _perSlotSafe > 0 ? (currentAmount / _perSlotSafe).floor() : 0;
        final int _pendingPassed = (_passedScheduled - _completedSlots) > 0 ? (_passedScheduled - _completedSlots) : 0;
        final double _computedFromSlots = (_completedSlots + _pendingPassed) * _perSlotSafe;
        double _uiAmount = currentAmount > _computedFromSlots ? currentAmount : _computedFromSlots;
        if (_uiAmount > dailyGoal) _uiAmount = dailyGoal.toDouble();
        final double _uiPercentage = (dailyGoal == 0) ? 0 : (_uiAmount / dailyGoal) * 100.0;

        DateTime? _lastDrink;
        try {
          if (widget.diary != null && widget.diary.water != null && widget.diary.water!.lastDrinkAt != null) {
            final t = widget.diary.water!.lastDrinkAt;
            if (t is DateTime) _lastDrink = t;
            else if (t != null && t.toDate != null) _lastDrink = t.toDate();
            else if (t is String) _lastDrink = DateTime.tryParse(t);
          }
        } catch (_) {}
        if ((_lastDrink == null || (_lastPassed != null && _lastDrink.isBefore(_lastPassed))) && _lastPassed != null) {
          _lastDrink = _lastPassed;
        }

        return FadeTransition(
          opacity: widget.mainScreenAnimation!,
          child: Transform(
            transform: Matrix4.translationValues(
                0.0, 30 * (1.0 - widget.mainScreenAnimation!.value), 0.0),
            child: Padding(
              padding: const EdgeInsets.only(
                  left: 24, right: 24, top: 16, bottom: 18),
              child: Container(
                decoration: BoxDecoration(
                  color: FitnessAppTheme.white,
                  borderRadius: const BorderRadius.only(
                      topLeft: Radius.circular(8.0),
                      bottomLeft: Radius.circular(8.0),
                      bottomRight: Radius.circular(8.0),
                      topRight: Radius.circular(68.0)),
                  boxShadow: <BoxShadow>[
          BoxShadow(
            color: FitnessAppTheme.grey.withAlpha((0.2 * 255).round()),
            offset: const Offset(1.1, 1.1),
            blurRadius: 10.0),
                  ],
                ),
                child: Padding(
                  padding: const EdgeInsets.only(
                      top: 16, left: 16, right: 16, bottom: 16),
                  child: Row(
                    children: <Widget>[
                      Expanded(
                        child: Column(
                          children: <Widget>[
                            Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: <Widget>[
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.start,
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: <Widget>[
                                    Padding(
                                      padding: const EdgeInsets.only(
                                          left: 4, bottom: 3),
                                      child: Builder(builder: (ctx) {
                                          final bool slotDueNoRecord = _lastPassed != null && (_lastDrink == null || _lastDrink.isBefore(_lastPassed));
                                          final int uiDisplay = _uiAmount.round();
                                          final String displayedText = slotDueNoRecord ? '~${_perSlotSafe.round()}' : uiDisplay.toString();
                                          return Text(
                                            displayedText,
                                            textAlign: TextAlign.center,
                                            style: TextStyle(
                                              fontFamily: FitnessAppTheme.fontName,
                                              fontWeight: FontWeight.w600,
                                              fontSize: 32,
                                              color: FitnessAppTheme.nearlyDarkBlue,
                                            ),
                                          );
                                        }),
                                    ),
                                    Padding(
                                      padding: const EdgeInsets.only(
                                          left: 8, bottom: 8),
                                      child: Text(
                                        'ml',
                                        textAlign: TextAlign.center,
                                        style: TextStyle(
                                          fontFamily: FitnessAppTheme.fontName,
                                          fontWeight: FontWeight.w500,
                                          fontSize: 18,
                                          letterSpacing: -0.2,
                                          color: FitnessAppTheme.nearlyDarkBlue,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                Padding(
                                  padding: const EdgeInsets.only(
                                      left: 4, top: 2, bottom: 14),
                                  child: Text(
                                    'of daily goal ${ (dailyGoal/1000).toStringAsFixed((dailyGoal%1000)==0?0:1) }L',
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                      fontFamily: FitnessAppTheme.fontName,
                                      fontWeight: FontWeight.w500,
                                      fontSize: 14,
                                      letterSpacing: 0.0,
                                      color: FitnessAppTheme.darkText,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            Padding(
                              padding: const EdgeInsets.only(
                                  left: 4, right: 4, top: 8, bottom: 16),
                              child: Container(
                                height: 2,
                                decoration: BoxDecoration(
                                  color: FitnessAppTheme.background,
                                  borderRadius: const BorderRadius.all(
                                      Radius.circular(4.0)),
                                ),
                              ),
                            ),
                            Padding(
                              padding: const EdgeInsets.only(top: 16),
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: <Widget>[
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.start,
                                    crossAxisAlignment:
                                        CrossAxisAlignment.center,
                                    children: <Widget>[
                                      Padding(
                                        padding: const EdgeInsets.only(left: 4),
                                        child: Icon(
                                          Icons.access_time,
                                          color: FitnessAppTheme.grey
                                              .withAlpha((0.5 * 255).round()),
                                          size: 16,
                                        ),
                                      ),
                                        Padding(
                                        padding:
                                            const EdgeInsets.only(left: 4.0),
                                        child: Builder(builder: (ctx) {
                                          DateTime? lastDrink;
                                          try {
                                            // Prefer diary stream value when present
                                            if (widget.diary != null && widget.diary.water != null && widget.diary.water!.lastDrinkAt != null) {
                                              final t = widget.diary.water!.lastDrinkAt;
                                              if (t is DateTime) lastDrink = t;
                                              else if (t != null && t.toDate != null) lastDrink = t.toDate();
                                              else if (t is String) lastDrink = DateTime.tryParse(t);
                                            }
                                          } catch (_) {}
                                          // Fallback to profile notifier value first, then profile prop
                                          try {
                                            final pMap = widget.profileNotifier?.value ?? widget.profile;
                                            if (lastDrink == null && pMap != null) {
                                              final p = pMap['water'];
                                              if (p is Map && p['lastDrinkAt'] != null) {
                                                final t = p['lastDrinkAt'];
                                                try {
                                                  if (t is DateTime) lastDrink = t;
                                                  else if (t != null && t.toDate != null) lastDrink = t.toDate();
                                                  else if (t is String) lastDrink = DateTime.tryParse(t);
                                                } catch (_) {}
                                              }
                                            }
                                          } catch (_) {}
                                          final lastText = lastDrink != null ? TimeOfDay.fromDateTime(lastDrink).format(ctx) : '\u2014';
                                          return Text(
                                            'Last drink $lastText',
                                            textAlign: TextAlign.center,
                                            style: TextStyle(
                                              fontFamily: FitnessAppTheme.fontName,
                                              fontWeight: FontWeight.w500,
                                              fontSize: 14,
                                              letterSpacing: 0.0,
                                              color: FitnessAppTheme.grey.withAlpha((0.5 * 255).round()),
                                            ),
                                          );
                                        }),
                                      ),
                                    ],
                                  ),
                                  Padding(
                                    padding: const EdgeInsets.only(top: 4),
                                    child: Row(
                                      mainAxisAlignment:
                                          MainAxisAlignment.start,
                                      crossAxisAlignment:
                                          CrossAxisAlignment.center,
                                      children: <Widget>[
                                        SizedBox(
                                          width: 24,
                                          height: 24,
                                          child: Image.asset(
                                              'assets/fitness_app/bell.png'),
                                        ),
                                        Flexible(
                                          child: Builder(builder: (ctx) {
                                                  final msg = percentageValue >= 100 ? 'You reached your goal — well done!' : 'Try to sip regularly to reach your goal';
                                                  final col = percentageValue >= 100 ? HexColor('#2E7D32') : HexColor('#F65283');
                                            return Text(
                                              msg,
                                              textAlign: TextAlign.start,
                                              style: TextStyle(
                                                fontFamily: FitnessAppTheme.fontName,
                                                fontWeight: FontWeight.w500,
                                                fontSize: 12,
                                                letterSpacing: 0.0,
                                                color: col,
                                              ),
                                            );
                                          }),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            )
                          ],
                        ),
                      ),
                      SizedBox(
                        width: 34,
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.center,
                          children: <Widget>[
                            GestureDetector(
                              onTap: increaseWater,
                              child:
                                Container(
                                  decoration: BoxDecoration(
                                    color: FitnessAppTheme.nearlyWhite,
                                    shape: BoxShape.circle,
                                    boxShadow: <BoxShadow>[
                            BoxShadow(
                                        color: FitnessAppTheme.nearlyDarkBlue
                                          .withAlpha((0.4 * 255).round()),
                                          offset: const Offset(4.0, 4.0),
                                          blurRadius: 8.0),
                                    ],
                                  ),
                                  child: Padding(
                                    padding: const EdgeInsets.all(6.0),
                                    child: Icon(
                                      Icons.local_drink,
                                      color: FitnessAppTheme.nearlyDarkBlue,
                                      size: 24,
                                    ),
                                  ),
                                ),
                            ),
                            const SizedBox(
                              height: 28,
                            ),
                            // Decrease/undo UI intentionally hidden — method remains for programmatic use.
                            SizedBox(height: 0, width: 0),
                          ],
                        ),
                      ),
                      Padding(
                        padding:
                            const EdgeInsets.only(left: 16, right: 8, top: 16),
                        child: Container(
                          width: 60,
                          height: 160,
                          decoration: BoxDecoration(
                            color: HexColor('#E8EDFE'),
                            borderRadius: const BorderRadius.only(
                                topLeft: Radius.circular(80.0),
                                bottomLeft: Radius.circular(80.0),
                                bottomRight: Radius.circular(80.0),
                                topRight: Radius.circular(80.0)),
                            boxShadow: <BoxShadow>[
                BoxShadow(
                  color: FitnessAppTheme.grey.withAlpha((0.4 * 255).round()),
                  offset: const Offset(2, 2),
                  blurRadius: 4),
                            ],
                          ),
                          child: Stack(
                            children: [
                              // Wave occupies the main area
                              Positioned.fill(
                                child: Column(
                                  children: [
                                    Expanded(
                                      child: WaveView(
                                        percentageValue: _uiPercentage,
                                      ),
                                    ),
                                    const SizedBox(height: 8),
                                  ],
                                ),
                              ),
                              // Vertical ticks removed — keep placeholder to preserve right-side spacing
                              Positioned(
                                right: 6,
                                top: 12,
                                bottom: 12,
                                child: const SizedBox.shrink(),
                              ),
                              // Invisible layer used to surface Last drink computed above in other parts of UI (we'll recompute when building parent)
                            ],
                          ),
                        ),
                      )
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
