import 'dart:convert';
import 'dart:async';
import 'package:http/http.dart' as http;
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'dart:io' show Platform, SocketException;
import 'package:best_flutter_ui_templates/services/event_bus.dart';

class BackendApi {
  // Read BASE_API_URL from .env via flutter_dotenv; fallback to localhost
  static String get baseUrl {
    final envUrl = dotenv.env['BASE_API_URL'];
    if (envUrl != null && envUrl.isNotEmpty) return envUrl;

    // Sensible defaults for dev
    if (kIsWeb) return 'http://localhost:5001';
    if (Platform.isAndroid) return 'http://10.0.2.2:5001'; // Android emulator
    if (Platform.isIOS) return 'http://127.0.0.1:5001';    // iOS simulator
    return 'http://localhost:5001';
  }

  // Simple health check
  static Future<Map<String, dynamic>> healthCheck() async {
    final url = Uri.parse('$baseUrl/api/health');
    final resp = await http.get(url, headers: {
      'Accept': 'application/json',
    });

    if (resp.statusCode >= 200 && resp.statusCode < 300) {
  EventBus.instance.emitSuccess('Kết nối server OK.');
      return jsonDecode(resp.body) as Map<String, dynamic>;
    }

    throw Exception('Health check failed: ${resp.statusCode}');
  }

  // Example: get auth/me (requires Authorization: Bearer <jwt> or cookie)
  static Future<Map<String, dynamic>> getMe({required String jwt}) async {
    final url = Uri.parse('$baseUrl/auth/me');
    final resp = await http.get(url, headers: {
      'Accept': 'application/json',
      'Authorization': 'Bearer $jwt',
    });

    if (resp.statusCode >= 200 && resp.statusCode < 300) {
      // No toast for routine profile fetchs by default, but keep hookable.
      return jsonDecode(resp.body) as Map<String, dynamic>;
    }

  EventBus.instance.emitError('Failed to retrieve user information.');
    throw Exception('getMe failed: ${resp.statusCode} ${resp.body}');
  }

  // Example: post water log
  static Future<Map<String, dynamic>> postWater({required String jwt, required int amountMl}) async {
    final url = Uri.parse('$baseUrl/water');
    final resp = await http.post(url,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $jwt',
        },
        body: jsonEncode({'amountMl': amountMl}));

    if (resp.statusCode >= 200 && resp.statusCode < 300) {
  EventBus.instance.emitSuccess('Water intake recorded successfully.');
      return jsonDecode(resp.body) as Map<String, dynamic>;
    }
  EventBus.instance.emitError('Failed to submit water intake.');
    throw Exception('postWater failed: ${resp.statusCode} ${resp.body}');
  }

  // Multipart file upload helper for /upload or /foods/scan
  // filePath: local path to file, fieldName: 'file' (backend expects 'file')
  // extraFields: optional form fields like mealType
  static Future<Map<String, dynamic>> uploadFile({
    required String jwt,
    required String endpointPath,
    required String filePath,
    String fieldName = 'file',
    Map<String, String>? extraFields,
  }) async {
    final uri = Uri.parse('$baseUrl$endpointPath');
    final request = http.MultipartRequest('POST', uri);

    request.headers['Authorization'] = 'Bearer $jwt';
    request.headers['Accept'] = 'application/json';

    if (extraFields != null) {
      request.fields.addAll(extraFields);
    }

    final file = await http.MultipartFile.fromPath(fieldName, filePath);
    request.files.add(file);

    final streamed = await request.send();
    final resp = await http.Response.fromStream(streamed);

    if (resp.statusCode >= 200 && resp.statusCode < 300) {
      return jsonDecode(resp.body) as Map<String, dynamic>;
    }

    throw Exception('uploadFile failed: ${resp.statusCode} ${resp.body}');
  }

  // Placeholder: loginWithToken
  // Frontend typically uses Firebase client SDK to get an idToken, then sends it to
  // POST /auth/login on the backend. Implement according to your auth flow.
  static Future<Map<String, dynamic>> loginWithIdToken({required String idToken}) async {
    final url = Uri.parse('$baseUrl/auth/login');
    http.Response resp;
    try {
      resp = await http
          .post(url,
              headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
              },
              body: jsonEncode({'idToken': idToken}))
          .timeout(const Duration(seconds: 10));
    } on TimeoutException catch (_) {
  EventBus.instance.emitError('Unable to connect to server (timeout). Check BASE_API_URL ($baseUrl) and network connection.');
      throw Exception('loginWithIdToken failed: timeout connecting to $baseUrl');
    } on SocketException catch (_) {
  EventBus.instance.emitError('Unable to connect to server. Check BASE_API_URL ($baseUrl) and network connection.');
      throw Exception('loginWithIdToken failed: socket error connecting to $baseUrl');
    } catch (e) {
  EventBus.instance.emitError('Error sending login request.');
      throw Exception('loginWithIdToken failed: $e');
    }

    if (resp.statusCode >= 200 && resp.statusCode < 300) {
      // return full parsed body so caller can extract backend JWT
      return jsonDecode(resp.body) as Map<String, dynamic>;
    }
    // try to parse backend error message and throw a readable exception
    try {
      final err = jsonDecode(resp.body);
      final msg = err is Map && err.containsKey('message') ? err['message'] : resp.body;
      throw Exception('loginWithIdToken failed: $msg');
    } catch (_) {
      throw Exception('loginWithIdToken failed: ${resp.statusCode} ${resp.body}');
    }
  }

  // POST /ai/chat - send message and optional history to backend AI coach
  static Future<Map<String, dynamic>> postAiChat({required String jwt, required String message, List<Map<String, String>>? history}) async {
    final url = Uri.parse('$baseUrl/ai/chat');
    final body = <String, dynamic>{'message': message};
    if (history != null) body['history'] = history;

    final resp = await http.post(url,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $jwt',
        },
        body: jsonEncode(body));

    if (resp.statusCode >= 200 && resp.statusCode < 300) {
  EventBus.instance.emitSuccess('AI interaction successful.');
      return jsonDecode(resp.body) as Map<String, dynamic>;
    }

  EventBus.instance.emitError('Failed to send AI message.');
    throw Exception('postAiChat failed: ${resp.statusCode} ${resp.body}');
  }

  // GET /ai/history?limit=.. - fetch AI chat history for authenticated user
  static Future<Map<String, dynamic>> getAiHistory({required String jwt, int limit = 50}) async {
    final url = Uri.parse('$baseUrl/ai/history?limit=$limit');
    final resp = await http.get(url, headers: {
      'Accept': 'application/json',
      'Authorization': 'Bearer $jwt',
    });

    if (resp.statusCode >= 200 && resp.statusCode < 300) {
      return jsonDecode(resp.body) as Map<String, dynamic>;
    }

    throw Exception('getAiHistory failed: ${resp.statusCode} ${resp.body}');
  }

  // POST /ai/summary - save or update a per-conversation summary for the
  // authenticated user. Body: { chatId, prompt, response, imagesUrls }
  static Future<Map<String, dynamic>> postAiSummary({
    required String jwt,
    required String chatId,
    required String prompt,
    required String response,
    List<String>? imagesUrls,
  }) async {
    final url = Uri.parse('$baseUrl/ai/summary');
    final body = {
      'chatId': chatId,
      'prompt': prompt,
      'response': response,
      'imagesUrls': imagesUrls ?? [],
    };

    final resp = await http.post(url,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $jwt',
        },
        body: jsonEncode(body));

    if (resp.statusCode >= 200 && resp.statusCode < 300) {
      return jsonDecode(resp.body) as Map<String, dynamic>;
    }

    throw Exception('postAiSummary failed: ${resp.statusCode} ${resp.body}');
  }

  // GET /ai/history?summary=1&limit=.. - fetch per-conversation summaries
  static Future<Map<String, dynamic>> getAiHistorySummaries({required String jwt, int limit = 50}) async {
    final url = Uri.parse('$baseUrl/ai/history?summary=1&limit=$limit');
    final resp = await http.get(url, headers: {
      'Accept': 'application/json',
      'Authorization': 'Bearer $jwt',
    });

    if (resp.statusCode >= 200 && resp.statusCode < 300) {
      return jsonDecode(resp.body) as Map<String, dynamic>;
    }

    throw Exception('getAiHistorySummaries failed: ${resp.statusCode} ${resp.body}');
  }

  // DELETE /ai/summary/:chatId - delete a saved summary for the authenticated user
  static Future<void> deleteAiSummary({required String jwt, required String chatId}) async {
    final url = Uri.parse('$baseUrl/ai/summary/$chatId');
    final resp = await http.delete(url, headers: {
      'Accept': 'application/json',
      'Authorization': 'Bearer $jwt',
    });

    if (resp.statusCode >= 200 && resp.statusCode < 300) return;
    throw Exception('deleteAiSummary failed: ${resp.statusCode} ${resp.body}');
  }

  // Signup via backend (/auth/register)
  static Future<Map<String, dynamic>> signup({
    required String fullName,
    required String email,
    required String password,
    String? phone,
  }) async {
    final url = Uri.parse('$baseUrl/auth/register');
    final body = {
      'fullName': fullName,
      'email': email,
      'password': password,
      if (phone != null) 'phone': phone,
    };

    http.Response resp;
    try {
      resp = await http
          .post(url,
              headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
              },
              body: jsonEncode(body))
          .timeout(const Duration(seconds: 10));
    } on TimeoutException catch (_) {
  EventBus.instance.emitError('Unable to connect to server (timeout). Check BASE_API_URL ($baseUrl) and network connection.');
      throw Exception('signup failed: timeout connecting to $baseUrl');
    } on SocketException catch (_) {
  EventBus.instance.emitError('Unable to connect to server. Check BASE_API_URL ($baseUrl) and network connection.');
      throw Exception('signup failed: socket error connecting to $baseUrl');
    } catch (e) {
  EventBus.instance.emitError('Error sending request. Check your connection and try again.');
      throw Exception('signup failed: $e');
    }

    if (resp.statusCode >= 200 && resp.statusCode < 300) {
      // Do not emit success here; let the caller decide when to show a success toast
      return jsonDecode(resp.body) as Map<String, dynamic>;
    }

    // try to parse error message
    try {
      final err = jsonDecode(resp.body);
  EventBus.instance.emitError('Registration failed.');
  throw Exception(err['message'] ?? resp.body);
    } catch (_) {
  EventBus.instance.emitError('Đăng ký thất bại.');
  throw Exception('signup failed: ${resp.statusCode} ${resp.body}');
    }
  }

  // ── Health Profile ─────────────────────────────────────────────────────────

  /// GET /health/profile — returns the user's health profile, or null if not set.
  static Future<Map<String, dynamic>> getHealthProfile({required String jwt}) async {
    final url = Uri.parse('$baseUrl/health/profile');
    final resp = await http.get(url, headers: {
      'Accept': 'application/json',
      'Authorization': 'Bearer $jwt',
    });
    if (resp.statusCode >= 200 && resp.statusCode < 300) {
      return jsonDecode(resp.body) as Map<String, dynamic>;
    }
    EventBus.instance.emitError('Could not load health profile.');
    throw Exception('getHealthProfile failed: ${resp.statusCode} ${resp.body}');
  }

  /// PUT /health/profile — create or update the user's health profile.
  /// Required fields: age, gender, heightCm, weightKg, activityLevel, goal.
  static Future<Map<String, dynamic>> putHealthProfile({
    required String jwt,
    required int age,
    required String gender,      // 'male' | 'female'
    required double heightCm,
    required double weightKg,
    required String activityLevel, // sedentary|light|moderate|active|veryActive
    required String goal,          // lose|gain|maintain
    int? targetWaterMlPerDay,
  }) async {
    final url = Uri.parse('$baseUrl/health/profile');
    final body = <String, dynamic>{
      'age': age,
      'gender': gender,
      'heightCm': heightCm,
      'weightKg': weightKg,
      'activityLevel': activityLevel,
      'goal': goal,
      if (targetWaterMlPerDay != null) 'targetWaterMlPerDay': targetWaterMlPerDay,
    };
    final resp = await http.put(url,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $jwt',
        },
        body: jsonEncode(body));
    if (resp.statusCode >= 200 && resp.statusCode < 300) {
      EventBus.instance.emitSuccess('Health profile saved.');
      return jsonDecode(resp.body) as Map<String, dynamic>;
    }
    EventBus.instance.emitError('Could not save health profile.');
    throw Exception('putHealthProfile failed: ${resp.statusCode} ${resp.body}');
  }

  /// GET /health/stats/daily?date=YYYY-MM-DD — calories & water summary for one day.
  static Future<Map<String, dynamic>> getHealthStatsDaily({required String jwt, required String date}) async {
    final url = Uri.parse('$baseUrl/health/stats/daily?date=$date');
    final resp = await http.get(url, headers: {
      'Accept': 'application/json',
      'Authorization': 'Bearer $jwt',
    });
    if (resp.statusCode >= 200 && resp.statusCode < 300) {
      return jsonDecode(resp.body) as Map<String, dynamic>;
    }
    EventBus.instance.emitError('Could not load daily health stats.');
    throw Exception('getHealthStatsDaily failed: ${resp.statusCode} ${resp.body}');
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  /// GET /stats/daily?date=YYYY-MM-DD
  static Future<Map<String, dynamic>> getStatsDaily({required String jwt, required String date}) async {
    final url = Uri.parse('$baseUrl/stats/daily?date=$date');
    final resp = await http.get(url, headers: {
      'Accept': 'application/json',
      'Authorization': 'Bearer $jwt',
    });
    if (resp.statusCode >= 200 && resp.statusCode < 300) {
      return jsonDecode(resp.body) as Map<String, dynamic>;
    }
    EventBus.instance.emitError('Could not load daily stats.');
    throw Exception('getStatsDaily failed: ${resp.statusCode} ${resp.body}');
  }

  /// GET /stats/weekly?start=YYYY-MM-DD
  static Future<Map<String, dynamic>> getStatsWeekly({required String jwt, required String startDate}) async {
    final url = Uri.parse('$baseUrl/stats/weekly?start=$startDate');
    final resp = await http.get(url, headers: {
      'Accept': 'application/json',
      'Authorization': 'Bearer $jwt',
    });
    if (resp.statusCode >= 200 && resp.statusCode < 300) {
      return jsonDecode(resp.body) as Map<String, dynamic>;
    }
    EventBus.instance.emitError('Could not load weekly stats.');
    throw Exception('getStatsWeekly failed: ${resp.statusCode} ${resp.body}');
  }

  /// GET /stats/monthly?month=YYYY-MM
  static Future<Map<String, dynamic>> getStatsMonthly({required String jwt, required String month}) async {
    final url = Uri.parse('$baseUrl/stats/monthly?month=$month');
    final resp = await http.get(url, headers: {
      'Accept': 'application/json',
      'Authorization': 'Bearer $jwt',
    });
    if (resp.statusCode >= 200 && resp.statusCode < 300) {
      return jsonDecode(resp.body) as Map<String, dynamic>;
    }
    EventBus.instance.emitError('Could not load monthly stats.');
    throw Exception('getStatsMonthly failed: ${resp.statusCode} ${resp.body}');
  }

  // ── Workouts ───────────────────────────────────────────────────────────────

  /// POST /workouts — log a completed workout.
  static Future<Map<String, dynamic>> postWorkout({
    required String jwt,
    String type = 'cardio',
    int duration = 0,
    int caloriesBurned = 0,
  }) async {
    final url = Uri.parse('$baseUrl/workouts');
    final resp = await http.post(url,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $jwt',
        },
        body: jsonEncode({'type': type, 'duration': duration, 'caloriesBurned': caloriesBurned}));
    if (resp.statusCode >= 200 && resp.statusCode < 300) {
      EventBus.instance.emitSuccess('Workout logged.');
      return jsonDecode(resp.body) as Map<String, dynamic>;
    }
    EventBus.instance.emitError('Could not log workout.');
    throw Exception('postWorkout failed: ${resp.statusCode} ${resp.body}');
  }
}
