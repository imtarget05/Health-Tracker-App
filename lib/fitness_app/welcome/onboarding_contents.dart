class OnboardingContents {
  final String title;
  final String image;
  final String desc;

  OnboardingContents({
    required this.title,
    required this.image,
    required this.desc,
  });
}

List<OnboardingContents> contents = [
  OnboardingContents(
    title: "Daily health monitoring",
    image: "assets/images/image1.png",
    desc: "Record your health metrics, activities and habits to improve yourself every day.",
  ),
  OnboardingContents(
    title: "Building a healthy lifestyle",
    image: "assets/images/image2.png",
    desc:
    "Manage your diet, sleep, and exercise to stay in top shape.",
  ),
  OnboardingContents(
    title: "Get smart reminders & analytics",
    image: "assets/images/image3.png",
    desc:
    "Track your progress, get early alerts, and tips to help you stay healthier.",
  ),
];