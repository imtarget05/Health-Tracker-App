import 'api_client.dart';
import 'auth_storage.dart';

class AuthService {
  static final AuthService instance = AuthService._();
  AuthService._();

  Future<Map<String, dynamic>> register({required String fullName, required String email, required String password, String? phone}) async {
    final payload = {
      'fullName': fullName,
      'email': email,
      'password': password,
      if (phone != null) 'phone': phone,
    };
    return ApiClient.instance.post('/auth/register', payload);
  }

  Future<Map<String, dynamic>> loginWithEmailPassword({required String email, required String password}) async {
    return ApiClient.instance.post('/auth/login-email', {
      'email': email,
      'password': password,
    });
  }

  /// GET /auth/me — requires a valid JWT saved via [AuthStorage.saveToken].
  Future<Map<String, dynamic>> me() async {
    final token = AuthStorage.token;
    if (token == null || token.isEmpty) {
      throw ApiException(401, 'No auth token available. Please log in first.');
    }
    return ApiClient.instance.get('/auth/me', headers: {
      'Authorization': 'Bearer $token',
    });
  }
}
