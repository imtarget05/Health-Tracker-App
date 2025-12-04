import 'package:flutter/material.dart';
import './profile.dart';

class DashboardPage extends StatefulWidget {
  final String title = 'Demo';

  @override
  _DashboardPageState createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  String _value = 'Project 1';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: DropdownButton<String>(
          value: _value,
          underline: const SizedBox(),
          dropdownColor: Colors.white,
          items: const [
            DropdownMenuItem(
              value: 'Project 1',
              child: Text('Project 1'),
            ),
            DropdownMenuItem(
              value: 'Project 2',
              child: Text('Project 2'),
            ),
          ],
          onChanged: (String? newValue) {
            if (newValue != null) {
              setState(() => _value = newValue);
            }
          },
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.account_circle),
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => ProfilePage()),
              );
            },
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(10),
        children: [
          ListTile(
            leading: const Icon(Icons.view_list),
            title: const Text('Portal'),
            subtitle: const Text('The project portal'),
            onTap: () {},
          ),
          ListTile(
            leading: const Icon(Icons.show_chart),
            title: const Text('Gallery'),
            subtitle: const Text('Displays the images in the project'),
            onTap: () {},
          ),
          ListTile(
            leading: const Icon(Icons.graphic_eq),
            title: const Text('Reports'),
            subtitle: const Text('AI based project reports'),
            onTap: () {},
          ),
          ListTile(
            leading: const Icon(Icons.settings),
            title: const Text('Project Setup'),
            subtitle: const Text('Create or View Projects'),
            onTap: () {},
          ),
        ],
      ),
    );
  }
}
