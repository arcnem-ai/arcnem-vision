import 'package:flutter/cupertino.dart';
import 'package:arcnem_vision_client/enums/auth_status.dart';
import 'package:arcnem_vision_client/services/auth_service.dart';

class AuthProvider extends ChangeNotifier {
  final AuthService _authService = AuthService();
  AuthStatus _status = AuthStatus.initial;
  Map<String, dynamic>? _session;
  String? _error;

  AuthStatus get status => _status;
  Map<String, dynamic>? get session => _session;
  String? get error => _error;

  AuthProvider() {
    _verifyStoredAPIKey();
  }

  Future<bool> _verifyStoredAPIKey() async {
    _status = AuthStatus.loading;
    _error = null;
    notifyListeners();

    final storedKeyEither = await _authService.getStoredAPIKey().run();

    final res = await storedKeyEither.fold(
      (_) async {
        _session = null;
        _status = AuthStatus.unauthenticated;
        return false;
      },
      (storedKey) async {
        final verification = await _authService
            .verifyAPIKey(storedKey, persistOnSuccess: false)
            .run();

        return verification.fold(
          (e) {
            _error = e;
            _session = null;
            _status = AuthStatus.unauthenticated;
            return false;
          },
          (value) {
            _session = value;
            _error = null;
            _status = AuthStatus.authenticated;
            return true;
          },
        );
      },
    );

    notifyListeners();

    return res;
  }

  Future<bool> verifyAPIKey(String apiKey) async {
    _status = AuthStatus.loading;
    _error = null;
    notifyListeners();

    final either = await _authService.verifyAPIKey(apiKey).run();

    final res = either.fold(
      (e) {
        _error = e;
        _session = null;
        _status = AuthStatus.unauthenticated;
        notifyListeners();

        return false;
      },
      (value) {
        _session = value;
        _error = null;
        _status = AuthStatus.authenticated;
        notifyListeners();
        return true;
      },
    );

    return res;
  }

  Future<void> signOut() async {
    _status = AuthStatus.loading;
    _error = null;
    notifyListeners();

    final signOutResult = await _authService.signOut().run();
    signOutResult.fold((e) => _error = e, (_) => _error = null);
    _session = null;
    _status = AuthStatus.unauthenticated;
    notifyListeners();
  }
}
