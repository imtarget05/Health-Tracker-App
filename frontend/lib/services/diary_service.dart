import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:intl/intl.dart';
import 'package:flutter/foundation.dart';
import '../models/diary.dart';
import 'auth_storage.dart';
import 'backend_api.dart';

class DiaryService {
  final FirebaseFirestore _db;
  final String uid;

  DiaryService(this._db, this.uid);

  String _docIdForDate(DateTime date) => DateFormat('yyyy-MM-dd').format(date);

  CollectionReference get _userDiaries => _db.collection('users').doc(uid).collection('diaries');

  Future<Diary?> getDiary(DateTime date) async {
    final id = _docIdForDate(date);
    final snap = await _userDiaries.doc(id).get();
    if (!snap.exists) return null;
    return Diary.fromMap(id, snap.data() as Map<String, dynamic>);
  }

  Stream<Diary?> streamDiary(DateTime date) {
    final id = _docIdForDate(date);
    return _userDiaries.doc(id).snapshots().map((snap) => snap.exists ? Diary.fromMap(id, snap.data() as Map<String, dynamic>) : null);
  }

  Future<void> setDiary(Diary diary) async {
    await _userDiaries.doc(diary.id).set(diary.toMap(), SetOptions(merge: true));
  }

  Future<void> updateWeight(DateTime date, double kg, {String source = 'manual'}) async {
    final id = _docIdForDate(date);
    final weightMap = {
      'valueKg': kg,
      'recordedAt': Timestamp.now(),
      'source': source,
    };
    await _userDiaries.doc(id).set({
      'weight': weightMap,
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }

  Future<void> addMeal(DateTime date, Meal meal) async {
    final id = _docIdForDate(date);
    final docRef = _userDiaries.doc(id);
  // Diagnostic: log target path and uid to help debug transaction failures
  debugPrint('DiaryService.addMeal: uid=$uid doc=${docRef.path}');
    // Perform a simple read-modify-write with retries to avoid using Firestore transactions,
    // which have caused platform/ emulator 'transactionGet' errors on some setups.
    const int maxAttempts = 3;
    for (int attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        final snap = await docRef.get();
        final data = snap.exists ? Map<String, dynamic>.from(snap.data() as Map<String, dynamic>) : {};
        final meals = (data['meals'] as List<dynamic>?)?.map((e) => Map<String, dynamic>.from(e)).toList() ?? [];
        meals.add(meal.toMap());
        await docRef.set({
          'meals': meals,
          'updatedAt': FieldValue.serverTimestamp(),
        }, SetOptions(merge: true));
        debugPrint('DiaryService.addMeal: write succeeded on attempt $attempt');
        return;
      } catch (e, st) {
        debugPrint('DiaryService.addMeal: write attempt $attempt failed: $e');
        debugPrintStack(label: 'DiaryService.addMeal write stack', stackTrace: st);
        if (attempt == maxAttempts) rethrow;
        await Future.delayed(Duration(milliseconds: 200 * attempt));
      }
    }
  }

  Future<void> incrementWater(DateTime date, int deltaMl) async {
    final id = _docIdForDate(date);
    final docRef = _userDiaries.doc(id);
    await _db.runTransaction((tx) async {
      final snap = await tx.get(docRef);
      final data = snap.exists ? Map<String, dynamic>.from(snap.data() as Map<String, dynamic>) : {};
      final current = (data['water'] != null && data['water']['consumedMl'] != null) ? (data['water']['consumedMl'] as num).toInt() : 0;
      int newVal = current + deltaMl;
      if (newVal < 0) newVal = 0; // prevent negative consumed values
      final waterMap = {
        'consumedMl': newVal,
        'dailyGoalMl': data['water'] != null && data['water']['dailyGoalMl'] != null ? (data['water']['dailyGoalMl'] as num).toInt() : 2000,
        'lastDrinkAt': Timestamp.now(),
      };
      tx.set(docRef, {
        'water': waterMap,
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
      // Mirror key water fields into the user's profile document so profile-driven UI and reminders
      // can read lastDrinkAt and today's consumed amount without reading diary doc.
      try {
        final userDoc = _db.collection('users').doc(uid);
        await userDoc.set({
          'water': {
            'lastDrinkAt': waterMap['lastDrinkAt'],
            'consumedTodayMl': newVal,
            'dailyGoalMl': waterMap['dailyGoalMl'],
          },
          'updatedAt': FieldValue.serverTimestamp(),
        }, SetOptions(merge: true));
      } catch (e) {
        // ignore non-fatal profile mirror errors
      }
    });

    // Sync to backend waterLogs collection so that GET /stats/daily and
    // GET /water return correct data. Fire-and-forget; diary is source of truth.
    if (deltaMl > 0) {
      final jwt = AuthStorage.token;
      if (jwt != null && jwt.isNotEmpty) {
        BackendApi.postWater(jwt: jwt, amountMl: deltaMl).catchError((e) {
          debugPrint('DiaryService.incrementWater: backend sync failed (non-fatal): $e');
        });
      }
    }
  }

  Future<void> setDailyWaterGoal(DateTime date, int goalMl) async {
    final id = _docIdForDate(date);
    await _userDiaries.doc(id).set({
      'water': {'dailyGoalMl': goalMl},
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }

  /// Update body measurements (height, bmi, bodyFatPercent) for the diary of [date].
  Future<void> updateBodyMeasurements(DateTime date, double heightCm, double bmi, double bodyFatPercent) async {
    final id = _docIdForDate(date);
    final bodyMap = {
      'heightCm': heightCm,
      'bmi': bmi,
      'bodyFatPercent': bodyFatPercent,
      'recordedAt': Timestamp.now(),
    };
    await _userDiaries.doc(id).set({
      'bodyMeasurements': bodyMap,
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
    // Also mirror key body fields into the user's profile document so profile-driven UI
    // that reads `profile.heightCm` / `profile.weightKg` / `profile.bmi` sees updates.
    try {
      final userDoc = _db.collection('users').doc(uid);
      final profileUpdates = <String, dynamic>{
        'heightCm': heightCm,
        'bmi': bmi,
  'bodyFatPercent': bodyFatPercent,
  'updatedAt': FieldValue.serverTimestamp(),
      };
      await userDoc.set(profileUpdates, SetOptions(merge: true));
    } catch (e) {
      // Non-fatal: diary update already applied. Log for debugging.
      // ignore errors quietly in UI context
    }
  }
}
