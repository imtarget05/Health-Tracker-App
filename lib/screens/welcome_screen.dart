import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:untitled/screens/signin_screen.dart';
import 'package:untitled/screens/signup_screen.dart';
import 'package:untitled/theme/theme.dart';
import 'package:untitled/widgets/custom_scaffold.dart';
import 'package:untitled/widgets/welcome_button.dart';

class WelcomeScreen extends StatelessWidget{
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return CustomScaffold(
      child: Column(
        children: [
          Flexible(
              flex: 8,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  vertical: 0,
                  horizontal: 40.0,
                ),
                child: Center(
                  child: RichText(
                    textAlign: TextAlign.center,
                    text: const TextSpan(
                      children: [
                        TextSpan(
                          text: 'Welcome Back!\n',
                          style: TextStyle(
                            fontSize: 45.0,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        TextSpan(
                          text: '\nMY KNOWLEDGE - YOUR HEALTH',
                          style: TextStyle(
                            fontSize: 20.0,
                            //fontWeight: FontWeight.w400,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ) // <--- Đã loại bỏ dấu ngoặc đóng thừa ở đây
          ), // <--- Dấu ngoặc đóng của Flexible

            Flexible (
            flex: 1,
            child: Align(
              alignment: Alignment.bottomRight,
              child: Row(
                children: [
                  const Expanded(
                    child: WelcomeButton(
                      buttonText: 'Sign In',
                      onTap: SignInScreen(),
                      color: Colors.transparent,
                      textColor: Colors.white,

                    ),
                  ),
                  Expanded(
                    child: WelcomeButton(
                      buttonText: 'Sign Up',
                      onTap: const SignUpScreen(),
                      color: Colors.white,
                      textColor: lightColorScheme.primary,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}