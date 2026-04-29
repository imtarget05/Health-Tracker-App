import 'dart:convert';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:http/http.dart' as http;
import 'package:flutter/foundation.dart' show kDebugMode;
import 'certificate_pinning.dart';  // ✅ NEW: Certificate pinning

class ApiClient {
  ApiClient._();
  static final ApiClient instance = ApiClient._();

  // Configure base URL via env or fallback. Must match BASE_API_URL used by BackendApi.
  static final String _baseUrl = dotenv.env['BACKEND_URL'] ?? dotenv.env['BASE_API_URL'] ?? 'http://localhost:5001';

  // ✅ NEW: HTTP client with certificate pinning
  static late http.Client _httpClient = _initHttpClient();

  static http.Client _initHttpClient() {
    // Use pinned HTTP client for production, regular client for dev
    if (kDebugMode) {
      return http.Client(); // Use regular client for development
    } else {
      return PinnedHttpClient(); // ✅ Use certificate pinning in production
    }
  }

  static Uri _uri(String path, [Map<String, dynamic>? query]) {
    return Uri.parse('$_baseUrl$path').replace(queryParameters: query);
  }

  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> body, {Map<String, String>? headers}) async {
    final h = {
      'Content-Type': 'application/json',
      ...?headers,
    };
    final b = body is String ? body : json.encode(body);
    
    try {
      final resp = await _httpClient.post(_uri(path), headers: h, body: b);

      final text = resp.body.isNotEmpty ? resp.body : '{}';
      final data = json.decode(text);
      if (resp.statusCode >= 200 && resp.statusCode < 300) {
        return data as Map<String, dynamic>;
      }
      throw ApiException(resp.statusCode, data is Map<String, dynamic> ? (data['message']?.toString() ?? 'Request failed') : 'Request failed');
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException(0, 'Network error: $e');
    }
  }

  Future<Map<String, dynamic>> get(String path, {Map<String, String>? headers}) async {
    try {
      final resp = await _httpClient.get(_uri(path), headers: headers);
      final text = resp.body.isNotEmpty ? resp.body : '{}';
      final data = json.decode(text);
      if (resp.statusCode >= 200 && resp.statusCode < 300) {
        return data as Map<String, dynamic>;
      }
      throw ApiException(resp.statusCode, data is Map<String, dynamic> ? (data['message']?.toString() ?? 'Request failed') : 'Request failed');
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException(0, 'Network error: $e');
    }
  }

  static Future<http.Response> put(String path, {Map<String, String>? headers, Object? body, Map<String, dynamic>? query}) {
    final h = {
      'Content-Type': 'application/json',
      ...?headers,
    };
    final b = body is String ? body : json.encode(body ?? {});
    return _httpClient.put(_uri(path, query), headers: h, body: b);
  }

  static Future<http.Response> delete(String path, {Map<String, String>? headers, Map<String, dynamic>? query}) {
    return _httpClient.delete(_uri(path, query), headers: headers);
  }
}

class ApiException implements Exception {
  final int statusCode;
  final String message;
  ApiException(this.statusCode, this.message);
  @override
  String toString() => 'ApiException($statusCode): $message';
}
