import 'package:flutter/material.dart';
import './register.dart';
import './resetpassword.dart';
import './dashboard.dart';

import '../welcome/onboarding_screen.dart';

class LoginPage extends StatefulWidget {
  final String? title;

  const LoginPage({Key? key, this.title}) : super(key: key);

  @override
  _LoginPageState createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _formKey = GlobalKey<FormState>();
  final TextEditingController _emailCtrl = TextEditingController();
  final TextEditingController _passCtrl = TextEditingController();

  bool _isLoading = false;

  Widget get _logo => Center(
    child: Hero(
      tag: 'hero',
      child: CircleAvatar(
        backgroundColor: Colors.transparent,
        radius: 100,
        child: Image.asset('assets/images/logo.png'),
      ),
    ),
  );

  Widget get _userNameField => TextFormField(
    controller: _emailCtrl,
    validator: (value) {
      if (value == null || value.isEmpty) {
        return "Please enter a valid email";
      }
      return null;
    },
    decoration: const InputDecoration(
        labelText: "EMAIL",
        labelStyle: TextStyle(fontWeight: FontWeight.bold)),
  );

  Widget get _passwordField => TextFormField(
    controller: _passCtrl,
    obscureText: true,
    validator: (value) {
      if (value == null || value.isEmpty) {
        return "Please enter the password";
      } else if (value.length < 6) {
        return "Password must be at least 6 characters";
      }
      return null;
    },
    decoration: const InputDecoration(
        labelText: "PASSWORD",
        labelStyle: TextStyle(fontWeight: FontWeight.bold)),
  );

  Widget get _forgotPassword => Container(
    alignment: Alignment.centerRight,
    child: InkWell(
      onTap: () {
        Navigator.push(
            context,
            MaterialPageRoute(
                builder: (_) => ResetPasswordPage(title: 'Reset Password')));
      },
      child: const Text(
        "Forgot Password?",
        style: TextStyle(
            fontWeight: FontWeight.bold,
            color: Colors.blue,
            decoration: TextDecoration.underline),
      ),
    ),
  );

  Widget get _loginButton => SizedBox(
    width: double.infinity,
    height: 45,
    child: ElevatedButton(
      style: ElevatedButton.styleFrom(
          backgroundColor: Colors.blue,
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(20))),
      onPressed: () async {
        if (!_formKey.currentState!.validate()) return;

        setState(() => _isLoading = true);

        await Future.delayed(const Duration(seconds: 1));

        setState(() => _isLoading = false);

        Navigator.push(
            context, MaterialPageRoute(builder: (_) => OnboardingScreen()));
      },
      child: _isLoading
          ? const CircularProgressIndicator(color: Colors.white)
          : const Text(
        "LOGIN",
        style: TextStyle(
            fontWeight: FontWeight.bold, color: Colors.white),
      ),
    ),
  );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      resizeToAvoidBottomInset: true,
      appBar: AppBar(title: Text(widget.title ?? "Login")),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKey,
          child: Column(
            children: [
              _logo,
              const SizedBox(height: 30),
              _userNameField,
              const SizedBox(height: 20),
              _passwordField,
              const SizedBox(height: 20),
              _forgotPassword,
              const SizedBox(height: 40),
              _loginButton,
              const SizedBox(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Text("New to CRM? "),
                  InkWell(
                    onTap: () {
                      Navigator.push(
                          context,
                          MaterialPageRoute(
                              builder: (_) =>
                                  RegisterPage(title: "Register")));
                    },
                    child: const Text(
                      "Register",
                      style: TextStyle(
                          color: Colors.blue,
                          fontWeight: FontWeight.bold,
                          decoration: TextDecoration.underline),
                    ),
                  ),
                ],
              )
            ],
          ),
        ),
      ),
    );
  }
}